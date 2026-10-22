"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardList, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { NetworkBadge } from "@/components/ui/network-badge";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip } from "@/components/ui/tooltip";
import { TokenAvatar } from "@/components/token/token-avatar";
import type { LimitOrder } from "@/lib/trading/types";
import { formatCompact, formatQuote, formatQuotePrice, formatRelativeTime, formatTokenAmount } from "@/lib/formatting";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<LimitOrder["status"], "green" | "red" | "neutral" | "warn"> = {
  open: "warn",
  filled: "green",
  cancelled: "neutral",
  failed: "red",
};

export function OrdersTable({
  hydrated,
  orders,
  onCancel,
}: {
  hydrated: boolean;
  orders: LimitOrder[];
  onCancel: (orderId: string) => Promise<void>;
}) {
  const [cancelling, setCancelling] = useState<string | null>(null);
  if (!hydrated) {
    return (
      <div className="flex items-center gap-2 p-4 text-2xs text-faint">
        <Spinner /> Restoring orders…
      </div>
    );
  }

  const sorted = [...orders].sort((a, b) => {
    if (a.status !== b.status) {
      if (a.status === "open") return -1;
      if (b.status === "open") return 1;
    }
    return b.updatedAt - a.updatedAt;
  });
  const openCount = orders.filter((order) => order.status === "open").length;

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No paper limit orders"
        description="Place a simulated limit order from the execution panel. It stays pending until a fresh provider price crosses the limit, then fills at the limit price."
        compact
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5 text-2xs text-faint">
        <span>
          <span className="text-warn">{openCount}</span> open / {orders.length} recorded
        </span>
        <span className="ml-auto">Checked every 25s while this app is open · fills at limit price</span>
      </div>
      <div className="overflow-x-auto panel-scroll">
        <table className="w-full min-w-[820px] border-separate border-spacing-0" aria-label="Paper limit orders">
          <thead className="bg-panel">
            <tr className="text-2xs uppercase tracking-wide text-faint">
              {["Created", "Token", "Side", "Limit price", "Size", "Est. fill qty", "Status", "Action"].map((h) => (
                <th
                  key={h}
                  className={cn(
                    "border-b border-border px-2 py-1.5 font-medium",
                    h === "Created" ? "pl-3 text-left" : h === "Token" || h === "Action" || h === "Status" ? "text-left" : "text-right",
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 40).map((order) => (
              <tr key={order.id} className="border-b border-border/60 hover:bg-panel-2/50">
                <td className="px-3 py-1.5 text-2xs text-faint">
                  <span className="block">{formatRelativeTime(order.createdAt)}</span>
                  <span className="num block">{new Date(order.createdAt).toLocaleTimeString("en-GB", { hour12: false })}</span>
                </td>
                <td className="px-2 py-1.5">
                  <Link
                    href={`/terminal?${new URLSearchParams({ network: order.token.network, pool: order.token.pool, token: order.token.address }).toString()}`}
                    className="flex items-center gap-1.5"
                  >
                    <TokenAvatar src={order.token.imageUrl} symbol={order.token.symbol} size={18} />
                    <span className="text-xs text-fg">{order.token.symbol}</span>
                    <NetworkBadge network={order.token.network} />
                  </Link>
                </td>
                <td className="px-2 py-1.5">
                  <Badge tone={order.side === "buy" ? "green" : "red"}>{order.side}</Badge>
                </td>
                <td className="num px-2 py-1.5 text-right text-xs">
                  {formatQuotePrice(order.limitPrice)} {order.quote}
                </td>
                <td className="num px-2 py-1.5 text-right text-xs text-muted">
                  {order.side === "buy" ? formatQuote(order.amount, order.quote) : `${formatTokenAmount(order.amount, 6)} ${order.token.symbol}`}
                </td>
                <td className="num px-2 py-1.5 text-right text-2xs text-faint">
                  {order.side === "buy"
                    ? `≈ ${formatCompact(order.amount / order.limitPrice)} ${order.token.symbol}`
                    : `≈ ${formatQuote(order.amount * order.limitPrice, order.quote)}`}
                </td>
                <td className="px-2 py-1.5">
                  <Tooltip
                    content={
                      order.status === "failed"
                        ? order.failureReason ?? "The order could not be filled."
                        : order.status === "open"
                          ? `Triggers when price ${order.side === "buy" ? "≤" : "≥"} ${formatQuotePrice(order.limitPrice)} ${order.quote}. Fee ${(order.feeRateBps / 100).toFixed(2)}%.`
                          : `Updated ${formatRelativeTime(order.updatedAt)}`
                    }
                  >
                    <Badge tone={STATUS_TONE[order.status]}>{order.status}</Badge>
                  </Tooltip>
                  {order.status === "failed" ? (
                    <span className="mt-0.5 block max-w-[180px] truncate text-2xs text-sell">{order.failureReason}</span>
                  ) : null}
                </td>
                <td className="px-2 py-1.5 text-left">
                  {order.status === "open" ? (
                    <button
                      type="button"
                      disabled={cancelling === order.id}
                      onClick={async () => {
                        setCancelling(order.id);
                        try {
                          await onCancel(order.id);
                        } finally {
                          setCancelling(null);
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-[2px] border border-border bg-panel-2 px-1.5 py-0.5 text-2xs text-muted hover:border-sell/40 hover:text-sell"
                    >
                      {cancelling === order.id ? <Spinner /> : <X className="h-2.5 w-2.5" />} Cancel
                    </button>
                  ) : (
                    <span className="text-2xs text-faint">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-3 py-1.5 text-2xs text-faint">
        Limit fills use the limit price and the fee rate captured when the order was placed. Slippage is not applied to
        limit fills. Balance/position checks run at trigger time; failed orders stay visible with a reason.
      </p>
    </div>
  );
}
