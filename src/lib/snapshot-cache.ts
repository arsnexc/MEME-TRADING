"use client";

/**
 * Tiny session-scoped snapshot store for polled list pages.
 *
 * When a public market-data API rate-limits us, a cold tab would otherwise show
 * an error and nothing else. Keeping the last successful payload in
 * `sessionStorage` lets the page paint that payload immediately, clearly labelled
 * as an older snapshot, while the poller keeps retrying.
 *
 * Honesty rules:
 * - the snapshot stores the timestamp it was fetched at, never "now";
 * - it lives for the browser session only and is capped in size;
 * - it is only ever a fallback for a *failed* first load — a successful response
 *   always replaces it.
 */

const PREFIX = "memescope.snapshot.v1:";
const MAX_BYTES = 256_000;

interface StoredSnapshot<T> {
  data: T;
  at: number;
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    // Private mode / disabled storage must never break a page.
    return null;
  }
}

export function readSnapshot<T>(key: string): StoredSnapshot<T> | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSnapshot<T>;
    if (!parsed || typeof parsed.at !== "number" || parsed.data === undefined) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSnapshot<T>(key: string, data: T, at: number): void {
  const store = storage();
  if (!store) return;
  try {
    const raw = JSON.stringify({ data, at });
    if (raw.length > MAX_BYTES) return;
    store.setItem(PREFIX + key, raw);
  } catch {
    // Quota exceeded or unserialisable payload: snapshots are best-effort.
  }
}

export function clearSnapshots(): void {
  const store = storage();
  if (!store) return;
  try {
    for (let i = store.length - 1; i >= 0; i -= 1) {
      const key = store.key(i);
      if (key && key.startsWith(PREFIX)) store.removeItem(key);
    }
  } catch {
    // ignore
  }
}
