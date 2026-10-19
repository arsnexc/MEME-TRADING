"use client";

import { useRouter } from "next/navigation";
import { Megaphone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NetworkBadge } from "@/components/ui/network-badge";
import { TokenAvatar } from "@/components/token/token-avatar";
import { formatQuote, formatRelativeTime } from "@/lib/formatting";
import { terminalHref } from "@/components/discovery/token-row";
import { useCalloutStore } from "@/stores/callouts";
import { useHydrated } from "@/stores/hydration";

export function SavedCallouts() {
  const hydrated = useHydrated();
  const callouts = useCalloutStore((state) => state.callouts);
  const remove = useCalloutStore((state) => state.remove);
  const router = useRouter();

  if (!hydrated) {
    return <div className="p-4 text-2xs text-faint">Loading local callouts…</div>;
  }

  if (callouts.length === 0) {
    return (
      <EmptyState
        icon={Megaphone}
        title="No saved callouts yet"
        description="Callouts in MEMESCOPE are private, locally saved notes — they are never posted to social media. Open a token terminal and use the Callout panel to write one."
        className="py-16"
      />
    );
  }

  return (
    <div>
      <div className="border-b border-border bg-panel-2/40 px-3 py-1.5 text-2xs text-faint">
        {callouts.length} local callout{callouts.length === 1 ? "" : "s"} · stored only in this browser · not published
      </div>
      <ul className="divide-y divide-border">
        {callouts.map((callout) => (
          <li key={callout.id} className="flex items-start gap-2.5 px-3 py-2.5">
            <TokenAvatar src={callout.token.imageUrl} symbol={callout.token.symbol} size={26} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold">{callout.token.symbol}</span>
                <NetworkBadge network={callout.token.network} />
                <span className="text-2xs text-faint">{formatRelativeTime(callout.createdAt)}</span>
                {callout.holdingThreshold != null ? (
                  <span className="text-2xs text-muted">
                    holds ≥ {formatQuote(callout.holdingThreshold, callout.token.network === "solana" ? "SOL" : "ETH")}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted">{callout.message}</p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    const params = new URLSearchParams({
                      network: callout.token.network,
                      pool: callout.token.pool,
                      token: callout.token.address,
                    });
                    router.push(`/terminal?${params.toString()}`);
                  }}
                >
                  Open terminal
                </Button>
                <Button size="xs" variant="ghost" onClick={() => remove(callout.id)} aria-label="Delete callout">
                  <Trash2 className="h-2.5 w-2.5" /> Delete
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="border-t border-border px-3 py-2 text-2xs text-faint">
        Callouts are simulated notes. Nothing is broadcast to X, Telegram or any external service.
      </p>
    </div>
  );
}

export function openTerminalForToken(
  router: ReturnType<typeof useRouter>,
  token: Parameters<typeof terminalHref>[0],
) {
  router.push(terminalHref(token));
}
