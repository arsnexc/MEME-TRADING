"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Command, Search, TrendingUp } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NetworkBadge } from "@/components/ui/network-badge";
import { Spinner } from "@/components/ui/spinner";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { fetchSearchClient } from "@/lib/market-data/client";
import type { MarketToken } from "@/lib/market-data/types";
import { formatUsd, formatUsdCompact } from "@/lib/formatting";
import { cn, truncateMiddle } from "@/lib/utils";

export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 320);
  const [results, setResults] = useState<MarketToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transportNote, setTransportNote] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setError(null);
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    const trimmed = debounced.trim();
    if (!open || trimmed.length < 2) {
      setLoading(false);
      setResults([]);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    fetchSearchClient({ query: trimmed, signal: controller.signal })
      .then((result) => {
        if (id !== requestId.current) return;
        setResults(result.data.tokens);
        setActiveIndex(0);
        setTransportNote(result.transport === "direct" ? "Provider queried directly from your browser." : null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Search failed.");
        setResults([]);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
    return () => controller.abort();
  }, [debounced, open]);

  const hint = useMemo(() => {
    if (query.trim().length < 2) return "Search any Solana, Ethereum or Base token by symbol, name or address.";
    if (loading) return "Searching DEX Screener…";
    if (error) return error;
    return `${results.length} result${results.length === 1 ? "" : "s"} · prices from DEX Screener`;
  }, [query, loading, error, results.length]);

  const openToken = (token: MarketToken) => {
    const search = new URLSearchParams({
      network: token.network,
      pool: token.pool,
      token: token.tokenAddress,
    });
    onOpenChange(false);
    router.push(`/terminal?${search.toString()}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Find a token" description={hint} className="max-w-xl p-0">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Symbol, name or contract address…"
            aria-label="Search tokens"
            className="h-7 border-0 bg-transparent px-0 text-sm focus:border-0"
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => Math.min(index + 1, Math.max(0, results.length - 1)));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(0, index - 1));
              } else if (event.key === "Enter" && results[activeIndex]) {
                event.preventDefault();
                openToken(results[activeIndex]);
              }
            }}
          />
          {loading ? <Spinner className="text-muted" /> : null}
          <kbd className="hidden items-center gap-0.5 rounded-[2px] border border-border bg-panel-2 px-1 py-0.5 text-2xs text-faint sm:flex">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </div>

        <div className="max-h-[min(60vh,420px)] min-h-[120px] overflow-y-auto panel-scroll">
          {results.length === 0 && !loading && !error ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <TrendingUp className="h-4 w-4 text-faint" />
              <p className="text-xs text-muted">{query.length >= 2 ? "No token matched that query." : "Search the live DEX Screener index."}</p>
              <p className="max-w-sm text-2xs text-faint">
                Try a ticker such as BONK, WIF or PEPE, or paste a full token address. Supported networks: Solana,
                Ethereum, Base.
              </p>
            </div>
          ) : null}
          {error ? (
            <div className="m-3 rounded-sm border border-sell/30 bg-sell/5 p-2 text-2xs text-sell">
              {error} <button type="button" className="underline" onClick={() => setQuery((q) => q + " ")}>Retry</button>
            </div>
          ) : null}
          <ul className="p-1" role="listbox" aria-label="Token search results">
            {results.map((token, index) => (
              <li key={token.id} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => openToken(token)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-[2px] px-2 py-1.5 text-left transition-colors",
                    index === activeIndex ? "bg-panel-2" : "hover:bg-panel-2/60",
                  )}
                >
                  {token.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={token.imageUrl} alt="" className="h-6 w-6 rounded-sm border border-border object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-sm border border-border bg-panel-2 text-2xs text-muted">
                      {token.symbol.slice(0, 2)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-fg">{token.symbol}</span>
                      <NetworkBadge network={token.network} />
                    </div>
                    <p className="truncate text-2xs text-muted">
                      {token.name} · {truncateMiddle(token.tokenAddress, 5, 4)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="num text-xs text-fg">{formatUsd(token.priceUsd)}</p>
                    <p className="num text-2xs text-faint">Liq {formatUsdCompact(token.liquidityUsd)}</p>
                  </div>
                  <ArrowRight className="h-3 w-3 text-faint" />
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-2xs text-faint">
          <span>{transportNote ?? "↑↓ to navigate · ↵ to open"}</span>
          <span>Search does not imply safety</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
