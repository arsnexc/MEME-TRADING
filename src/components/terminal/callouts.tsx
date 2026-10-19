"use client";

import { useState } from "react";
import { Copy, Megaphone, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { NetworkBadge } from "@/components/ui/network-badge";
import { TokenAvatar } from "@/components/token/token-avatar";
import { formatQuote, formatRelativeTime } from "@/lib/formatting";
import { copyToClipboard } from "@/lib/utils";
import type { TokenRef } from "@/lib/trading/types";
import { useCalloutStore } from "@/stores/callouts";
import { useHydrated } from "@/stores/hydration";
import { toast } from "@/stores/toast";

function shareText(token: TokenRef, message: string, threshold: number | null): string {
  const quote = token.network === "solana" ? "SOL" : "ETH";
  return `${token.symbol} callout — ${message}${threshold ? ` (holding ≥ ${threshold} ${quote})` : ""} — via MEMESCOPE paper terminal. Not financial advice.`;
}

export function CalloutComposer({ token, compact = false }: { token: TokenRef; compact?: boolean }) {
  const hydrated = useHydrated();
  const add = useCalloutStore((state) => state.add);
  const [message, setMessage] = useState("");
  const [threshold, setThreshold] = useState("");
  const [error, setError] = useState<string | null>(null);
  const quote = token.network === "solana" ? "SOL" : "ETH";

  const save = () => {
    const trimmed = message.trim();
    if (!trimmed) {
      setError("Write a short callout message first.");
      return;
    }
    const parsedThreshold = threshold.trim() === "" ? null : Number(threshold);
    if (parsedThreshold != null && (!Number.isFinite(parsedThreshold) || parsedThreshold < 0)) {
      setError("Holding threshold must be a positive number or left blank.");
      return;
    }
    const callout = add({ token, message: trimmed, holdingThreshold: parsedThreshold });
    if (!callout) {
      setError("The callout could not be saved.");
      return;
    }
    setError(null);
    setMessage("");
    setThreshold("");
    toast({ title: "Callout saved locally", description: "It stays in this browser and is never published.", variant: "success" });
  };

  return (
    <div className={compact ? "" : "border-t border-border px-2.5 py-2"}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide text-muted">
          <Megaphone className="h-3 w-3" /> Make a callout
        </p>
        <Badge tone="ghost">local only</Badge>
      </div>
      <p className="mt-1 text-2xs leading-relaxed text-faint">
        Save a private note for {token.symbol}. Nothing is posted to X, Telegram or any external service.
      </p>
      <textarea
        value={message}
        onChange={(event) => {
          setMessage(event.target.value.slice(0, 280));
          setError(null);
        }}
        rows={compact ? 2 : 3}
        placeholder={`Your ${token.symbol} thesis, observation or paper-trade note…`}
        aria-label="Callout message"
        className="mt-1.5 w-full resize-none rounded-sm border border-border bg-panel-2 px-2 py-1.5 text-xs text-fg outline-none placeholder:text-faint hover:border-border-strong focus:border-accent/70"
      />
      <div className="mt-1 flex items-center justify-between text-2xs text-faint">
        <span>{message.length}/280</span>
        {error ? <span className="text-sell">{error}</span> : null}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <label className="flex min-w-0 flex-1 items-center gap-1 text-2xs text-faint">
          <span className="whitespace-nowrap">Hold ≥</span>
          <Input
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            inputMode="decimal"
            placeholder="optional"
            aria-label={`Holding threshold in ${quote}`}
            className="h-6 text-2xs"
          />
          <span>{quote}</span>
        </label>
        <Button size="sm" variant="primary" disabled={!hydrated} onClick={save}>
          <Send className="h-3 w-3" /> Save
        </Button>
      </div>
      <p className="mt-1.5 text-2xs text-faint">
        Holding threshold is a display filter for this note only; it does not enforce or verify holdings.
      </p>
    </div>
  );
}

export function TokenCallouts({ token, limit = 20 }: { token: TokenRef; limit?: number }) {
  const hydrated = useHydrated();
  const callouts = useCalloutStore((state) => state.callouts);
  const remove = useCalloutStore((state) => state.remove);
  const filtered = callouts.filter(
    (callout) => callout.token.network === token.network && callout.token.address === token.address,
  );

  if (!hydrated) return <div className="p-4 text-2xs text-faint">Restoring local callouts…</div>;

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={Megaphone}
        title={`No saved callouts for ${token.symbol}`}
        description="Use the Callout panel in the execution column to save a private note. Callouts are never published from this app."
        compact
      />
    );
  }

  return (
    <div>
      <div className="border-b border-border px-3 py-1.5 text-2xs text-faint">
        {filtered.length} local callout{filtered.length === 1 ? "" : "s"} · saved in this browser only
      </div>
      <ul className="divide-y divide-border">
        {filtered.slice(0, limit).map((callout) => (
          <li key={callout.id} className="flex items-start gap-2 px-3 py-2">
            <TokenAvatar src={callout.token.imageUrl} symbol={callout.token.symbol} size={20} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 text-2xs">
                <span className="font-medium text-fg">{callout.token.symbol}</span>
                <NetworkBadge network={callout.token.network} />
                <span className="text-faint">{formatRelativeTime(callout.createdAt)}</span>
                {callout.holdingThreshold != null ? (
                  <span className="text-muted">
                    holds ≥ {formatQuote(callout.holdingThreshold, callout.token.network === "solana" ? "SOL" : "ETH")}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-muted">{callout.message}</p>
              <div className="mt-1 flex items-center gap-1">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-[2px] px-1 py-0.5 text-2xs text-faint hover:text-fg"
                  onClick={async () => {
                    try {
                      await copyToClipboard(shareText(callout.token, callout.message, callout.holdingThreshold));
                      toast({ title: "Share text copied", variant: "info" });
                    } catch {
                      toast({ title: "Clipboard unavailable", variant: "error" });
                    }
                  }}
                >
                  <Copy className="h-2.5 w-2.5" /> Copy share text
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-[2px] px-1 py-0.5 text-2xs text-faint hover:text-sell"
                  onClick={() => remove(callout.id)}
                >
                  <Trash2 className="h-2.5 w-2.5" /> Delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
