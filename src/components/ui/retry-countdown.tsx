"use client";

import { useNow } from "@/hooks/use-now";
import { useHydrated } from "@/stores/hydration";

/**
 * Live countdown to the next automatic retry. Renders a stable label on the
 * server so the surrounding banner does not hydrate with a mismatched clock.
 */
export function RetryCountdown({ at, prefix = "retrying in" }: { at: number | null; prefix?: string }) {
  const hydrated = useHydrated();
  const now = useNow(1_000);
  if (at == null) return null;
  if (!hydrated) return <span className="text-faint">{prefix} a moment…</span>;
  const seconds = Math.max(0, Math.ceil((at - now) / 1000));
  return (
    <span className="num text-faint">
      {seconds > 0 ? `${prefix} ${seconds}s` : `${prefix} now…`}
    </span>
  );
}
