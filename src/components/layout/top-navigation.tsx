"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Command, Search, Settings2, Wallet } from "lucide-react";
import { SearchDialog } from "@/components/layout/search-dialog";
import { SettingsDialog } from "@/components/layout/settings-dialog";
import { MarketStatus } from "@/components/layout/market-status";
import { QuoteSelector } from "@/components/layout/quote-selector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useHydrated } from "@/stores/hydration";
import { usePaperStore } from "@/stores/paper-trading";
import { formatQuote } from "@/lib/formatting";
import { cn } from "@/lib/utils";

/**
 * Four destinations that actually do something, in the order a new user needs
 * them: find a token, see what is moving, keep a watchlist, check the account.
 * Everything else lives under "More" and is explicitly labelled as not built.
 */
const NAV_ITEMS = [
  { href: "/", label: "Discover", hint: "Scan tokens and open a chart" },
  { href: "/pulse", label: "Market pulse", hint: "Volume, movers and new pools" },
  { href: "/trackers", label: "Watchlist", hint: "Tokens and notes saved in this browser" },
  { href: "/portfolio", label: "Portfolio", hint: "Cash, positions, orders and history" },
];

const COMING_SOON = [
  { href: "/perpetuals", label: "Perpetuals", note: "Spot-only build — no futures" },
  { href: "/predictions", label: "Predictions", note: "No prediction venue connected" },
  { href: "/vision", label: "Vision", note: "No model or signal feed" },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="MEMESCOPE home">
      <span className="relative flex h-6 w-6 items-center justify-center rounded-[2px] border border-accent/40 bg-accent/10">
        <span className="absolute inset-0 grid-lines opacity-30" aria-hidden="true" />
        <span className="relative text-[11px] font-black tracking-tighter text-[#f5f5f5]">M</span>
      </span>
      <span className="hidden flex-col leading-none sm:flex">
        <span className="text-[12px] font-semibold tracking-[0.08em] text-fg">MEMESCOPE</span>
        <span className="mt-0.5 text-[9px] uppercase tracking-[0.16em] text-faint">paper terminal</span>
      </span>
    </Link>
  );
}

export function TopNavigation() {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const hydrated = useHydrated();
  const balances = usePaperStore((state) => state.balances);
  const openOrders = usePaperStore((state) => state.orders.filter((order) => order.status === "open").length);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const isActive = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(href));
  const soonActive = COMING_SOON.some((item) => isActive(item.href));

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/85">
      <div className="flex h-11 items-center gap-3 px-2.5 sm:px-3">
        <Logo />
        <nav aria-label="Primary" className="hidden min-w-0 flex-1 items-center gap-0.5 lg:flex">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.hint}
                className={cn(
                  "relative flex h-11 items-center px-2.5 text-xs font-medium transition-colors",
                  active ? "text-fg" : "text-muted hover:text-fg",
                )}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
                {active ? <span className="absolute inset-x-2.5 bottom-0 h-[1.5px] bg-accent" /> : null}
              </Link>
            );
          })}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex h-11 items-center gap-1 px-2.5 text-xs font-medium transition-colors",
                  soonActive ? "text-fg" : "text-faint hover:text-muted",
                )}
              >
                More <ChevronDown className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted">Not in this build</p>
              <p className="mt-1 text-2xs leading-relaxed text-faint">
                These pages exist so the limits of the product are visible. They contain no fabricated data.
              </p>
              <div className="mt-2 space-y-0.5">
                {COMING_SOON.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex flex-col rounded-sm px-1.5 py-1 text-2xs text-muted transition-colors hover:bg-panel-2 hover:text-fg"
                  >
                    <span className="font-medium">{item.label}</span>
                    <span className="text-faint">{item.note}</span>
                  </Link>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-7 items-center gap-1.5 rounded-sm border border-border bg-panel px-2 text-2xs text-muted transition-colors hover:border-border-strong hover:text-fg"
            aria-label="Search tokens"
          >
            <Search className="h-3 w-3" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden items-center gap-0.5 text-faint md:flex">
              <Command className="h-2.5 w-2.5" />K
            </kbd>
          </button>
          <QuoteSelector />
          <MarketStatus />
          <Tooltip
            content={
              <span>
                <b>Cash available to trade.</b> Money moved into open positions is not counted here — open the
                portfolio for total value. Accounts are separate:{" "}
                <b>{hydrated ? balances.SOL.toFixed(2) : "50.00"} SOL</b> and{" "}
                <b>{hydrated ? balances.ETH.toFixed(2) : "50.00"} ETH</b>, with no conversion between them.
                {openOrders > 0 ? ` ${openOrders} pending limit order${openOrders === 1 ? "" : "s"}.` : ""}
              </span>
            }
          >
            <Link
              href="/portfolio"
              className="hidden h-7 items-center gap-1.5 rounded-sm border border-border bg-panel px-2 text-2xs text-muted transition-colors hover:text-fg xl:flex"
            >
              <Wallet className="h-3 w-3" />
              <span className="text-faint">cash</span>
              <span className="num">{hydrated ? formatQuote(balances.SOL, "SOL", 4) : "— SOL"}</span>
              <span className="text-faint">·</span>
              <span className="num">{hydrated ? formatQuote(balances.ETH, "ETH", 4) : "— ETH"}</span>
            </Link>
          </Tooltip>
          <Tooltip content="Every order is simulated. Deposits and withdrawals are disabled because no wallet can be connected.">
            <span tabIndex={0} className="inline-flex">
              <Badge tone="warn" className="hidden sm:inline-flex">
                PAPER ONLY
              </Badge>
            </span>
          </Tooltip>
          <SettingsDialog>
            <Button variant="ghost" size="icon" aria-label="Open settings">
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </SettingsDialog>
          <Link
            href="/portfolio"
            className="hidden h-7 items-center rounded-sm border border-border bg-panel px-2 text-2xs font-medium text-muted transition-colors hover:text-fg sm:flex"
          >
            Portfolio
          </Link>
        </div>
      </div>
      <nav aria-label="Primary mobile" className="flex items-center gap-0.5 overflow-x-auto border-t border-border px-2 panel-scroll lg:hidden">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex h-8 shrink-0 items-center px-2 text-2xs font-medium",
                active ? "text-fg" : "text-muted",
              )}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
              {active ? <span className="absolute inset-x-1.5 bottom-0 h-[1.5px] bg-accent" /> : null}
            </Link>
          );
        })}
      </nav>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}
