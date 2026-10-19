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
import { useHydrated } from "@/stores/hydration";
import { usePaperStore } from "@/stores/paper-trading";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Discover" },
  { href: "/pulse", label: "Pulse" },
  { href: "/trackers", label: "Trackers" },
  { href: "/perpetuals", label: "Perpetuals", muted: true },
  { href: "/predictions", label: "Predictions", muted: true },
  { href: "/vision", label: "Vision", muted: true },
  { href: "/portfolio", label: "Portfolio" },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="MEMESCOPE home">
      <span className="relative flex h-6 w-6 items-center justify-center rounded-[2px] border border-accent/40 bg-accent/10">
        <span className="absolute inset-0 grid-lines opacity-30" aria-hidden="true" />
        <span className="relative text-[11px] font-black tracking-tighter text-[#9aa6ff]">M</span>
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

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/85">
      <div className="flex h-11 items-center gap-3 px-2.5 sm:px-3">
        <Logo />
        <nav aria-label="Primary" className="hidden min-w-0 flex-1 items-center gap-0.5 lg:flex">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex h-11 items-center px-2.5 text-xs font-medium transition-colors",
                  active ? "text-fg" : item.muted ? "text-faint hover:text-muted" : "text-muted hover:text-fg",
                )}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
                {active ? <span className="absolute inset-x-2.5 bottom-0 h-[1.5px] bg-accent" /> : null}
              </Link>
            );
          })}
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
                Paper accounts are separate: <b>{hydrated ? balances.SOL.toFixed(2) : "50.00"} SOL</b> and{" "}
                <b>{hydrated ? balances.ETH.toFixed(2) : "50.00"} ETH</b>. No conversion between them.
                {openOrders > 0 ? ` ${openOrders} pending limit order${openOrders === 1 ? "" : "s"}.` : ""}
              </span>
            }
          >
            <Link
              href="/portfolio"
              className="hidden h-7 items-center gap-1.5 rounded-sm border border-border bg-panel px-2 text-2xs text-muted transition-colors hover:text-fg xl:flex"
            >
              <Wallet className="h-3 w-3" />
              <span className="num">{hydrated ? `${balances.SOL.toFixed(2)} SOL` : "— SOL"}</span>
              <span className="text-faint">·</span>
              <span className="num">{hydrated ? `${balances.ETH.toFixed(2)} ETH` : "— ETH"}</span>
            </Link>
          </Tooltip>
          <Tooltip content="Simulation only — wallet deposits are disabled and no wallet can be connected.">
            <span tabIndex={0} className="inline-flex">
              <Button variant="primary" size="sm" disabled className="pointer-events-none">
                Deposit
              </Button>
            </span>
          </Tooltip>
          <Badge tone="warn" className="hidden sm:inline-flex">
            PAPER
          </Badge>
          <SettingsDialog>
            <Button variant="ghost" size="icon" aria-label="Open settings">
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </SettingsDialog>
          <button
            type="button"
            aria-label="Paper account"
            className="hidden h-6 w-6 items-center justify-center rounded-full border border-accent/40 bg-accent/15 text-2xs font-semibold text-[#b9c2ff] sm:flex"
            onClick={() => {
              window.location.href = "/portfolio";
            }}
          >
            P
          </button>
          <ChevronDown className="hidden h-3 w-3 text-faint sm:block" aria-hidden="true" />
        </div>
      </div>
      <nav aria-label="Primary mobile" className="flex items-center gap-0.5 overflow-x-auto border-t border-border px-2 lg:hidden">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex h-8 shrink-0 items-center px-2 text-2xs font-medium",
                active ? "text-fg" : item.muted ? "text-faint" : "text-muted",
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
