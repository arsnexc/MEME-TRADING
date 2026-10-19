"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Clock, Command, Search, Settings2, Wallet } from "lucide-react";
import { SearchDialog } from "@/components/layout/search-dialog";
import { SettingsDialog } from "@/components/layout/settings-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useHydrated } from "@/stores/hydration";
import { usePaperStore } from "@/stores/paper-trading";
import { formatQuote } from "@/lib/formatting";
import { cn } from "@/lib/utils";

/**
 * Terminal chrome, modelled on the reference trading terminal: one dense row
 * with the brand, the working destinations, a symbol/search box and the paper
 * account on the right. Everything that does not work in this build lives under
 * "More" and says so.
 */
const NAV_ITEMS = [
  { href: "/", label: "Discover", hint: "Scan tokens and open a chart" },
  { href: "/pulse", label: "Pulse", hint: "Volume, movers and new pools" },
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
    <Link href="/" className="flex items-center gap-1.5 pr-1" aria-label="MEMESCOPE home">
      <span className="flex h-6 w-6 items-center justify-center rounded-[3px] bg-accent text-[11px] font-black leading-none text-black">
        M
      </span>
      <span className="hidden text-[11px] font-semibold tracking-[0.1em] text-fg sm:inline">MEMESCOPE</span>
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
    <header className="sticky top-0 z-40 border-b border-border bg-[#0b0b0b]">
      <div className="flex h-11 items-center gap-1 px-2">
        <Logo />

        <nav aria-label="Primary" className="hidden min-w-0 flex-1 items-center lg:flex">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.hint}
                className={cn(
                  "relative flex h-11 items-center px-2 text-xs font-medium transition-colors",
                  active ? "text-fg" : "text-muted hover:text-fg",
                )}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
                {active ? <span className="absolute inset-x-2 bottom-0 h-[2px] bg-fg" /> : null}
              </Link>
            );
          })}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex h-11 items-center gap-1 px-2 text-xs font-medium transition-colors",
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

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-7 w-8 items-center gap-1.5 rounded-sm border border-border bg-panel px-2 text-2xs text-muted transition-colors hover:border-border-strong hover:text-fg sm:w-44 lg:w-56"
            aria-label="Search tokens"
          >
            <Search className="h-3 w-3 shrink-0" />
            <span className="hidden truncate sm:inline">Search token…</span>
            <kbd className="ml-auto hidden items-center gap-0.5 text-faint md:flex">
              <Command className="h-2.5 w-2.5" />K
            </kbd>
          </button>

          <Tooltip
            content={
              <span>
                <b>Cash available to trade.</b> Money moved into open positions is not counted here — the bottom bar
                shows account balance and equity. Accounts are separate:{" "}
                <b>{hydrated ? balances.SOL.toFixed(2) : "50.00"} SOL</b> and{" "}
                <b>{hydrated ? balances.ETH.toFixed(2) : "50.00"} ETH</b>, with no conversion between them.
                {openOrders > 0
                  ? ` ${openOrders} limit order${openOrders === 1 ? "" : "s"} still waiting — cash moves only when one fills.`
                  : ""}
              </span>
            }
          >
            <Link
              href="/portfolio"
              className="hidden h-7 items-center gap-1.5 rounded-sm border border-border bg-panel px-2 text-2xs text-muted transition-colors hover:text-fg xl:flex"
            >
              <Wallet className="h-3 w-3" />
              <span className="text-faint">cash</span>
              <span className="num text-fg">{hydrated ? formatQuote(balances.SOL, "SOL", 4) : "— SOL"}</span>
              <span className="text-faint">·</span>
              <span className="num text-fg">{hydrated ? formatQuote(balances.ETH, "ETH", 4) : "— ETH"}</span>
            </Link>
          </Tooltip>

          {hydrated && openOrders > 0 ? (
            <Tooltip content="These limit orders have not filled yet, so no cash has moved. Open the portfolio to cancel or review them.">
              <Link
                href="/portfolio"
                className="flex h-7 items-center gap-1 rounded-sm border border-warn/40 bg-warn/10 px-2 text-2xs text-warn transition-colors hover:bg-warn/15"
              >
                <Clock className="h-3 w-3" />
                <span className="num">{openOrders}</span>
                <span className="hidden sm:inline">waiting</span>
              </Link>
            </Tooltip>
          ) : null}

          <Tooltip content="Every order is simulated. Deposits and withdrawals are disabled because no wallet can be connected.">
            <span tabIndex={0} className="hidden sm:inline-flex">
              <Badge tone="warn">PAPER</Badge>
            </span>
          </Tooltip>

          <SettingsDialog>
            <Button variant="ghost" size="icon" aria-label="Open settings">
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </SettingsDialog>
        </div>
      </div>

      <nav
        aria-label="Primary mobile"
        className="flex items-center gap-0.5 overflow-x-auto border-t border-border px-2 panel-scroll lg:hidden"
      >
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
              {active ? <span className="absolute inset-x-1.5 bottom-0 h-[2px] bg-fg" /> : null}
            </Link>
          );
        })}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "relative flex h-8 shrink-0 items-center gap-0.5 px-2 text-2xs font-medium",
                soonActive ? "text-fg" : "text-faint",
              )}
            >
              More <ChevronDown className="h-2.5 w-2.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-60">
            <p className="text-2xs font-semibold uppercase tracking-wide text-muted">Not in this build</p>
            <div className="mt-1.5 space-y-0.5">
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

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}
