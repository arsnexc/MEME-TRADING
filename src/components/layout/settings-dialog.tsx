"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Database, RotateCcw, ShieldAlert } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { DISPLAY_CURRENCIES, type DisplayCurrency } from "@/lib/constants";
import { formatQuote } from "@/lib/formatting";
import { useDisplayCurrency } from "@/hooks/use-display-currency";
import { useHydrated } from "@/stores/hydration";
import { usePaperStore } from "@/stores/paper-trading";
import { toast } from "@/stores/toast";

export function SettingsDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const hydrated = useHydrated();
  const { currency, setCurrency } = useDisplayCurrency();
  const balances = usePaperStore((state) => state.balances);
  const reset = usePaperStore((state) => state.resetAccount);

  useEffect(() => {
    if (!open) setConfirmReset(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        title="Terminal settings"
        description="Paper-simulation settings are stored in this browser only. No wallet or account data is collected."
        className="max-w-xl"
      >
        <div className="space-y-4">
          <section>
            <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">Display currency</h3>
            <p className="mt-1 text-2xs leading-relaxed text-faint">
              Conversion only. Paper balances remain separate accounts ({hydrated ? `SOL ${balances.SOL.toFixed(2)} · ETH ${balances.ETH.toFixed(2)}` : "loading…"}).
            </p>
            <Segmented
              className="mt-2"
              label="Display currency"
              value={currency}
              onChange={(value) => setCurrency(value as DisplayCurrency)}
              options={DISPLAY_CURRENCIES.map((value) => ({ value, label: value }))}
            />
          </section>

          <section className="border-t border-border pt-3">
            <h3 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted">
              <Database className="h-3 w-3" /> Market data
            </h3>
            <ul className="mt-1.5 space-y-1 text-2xs text-faint">
              <li>• Trending &amp; new pools: GeckoTerminal public API v2 (30 req/min per IP).</li>
              <li>• Search, logos and socials: DEX Screener public API (300 req/min).</li>
              <li>• OHLCV candles and recent trades: GeckoTerminal. No synthetic candles are generated.</li>
              <li>• Security data (mint/freeze authority, holder concentration) is not available from these sources and is shown as unknown.</li>
            </ul>
          </section>

          <section className="border-t border-border pt-3">
            <h3 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-muted">
              <ShieldAlert className="h-3 w-3" /> Simulation disclosure
            </h3>
            <p className="mt-1.5 text-2xs leading-relaxed text-faint">
              Every order in this terminal is simulated. Starting balances are {formatQuote(50, "SOL")} and {formatQuote(50, "ETH")}.
              No private keys, swaps, signatures or real funds are involved. Market data can be delayed, cached or
              rate-limited; the paper engine refuses trades when the reference price is missing or stale.
            </p>
          </section>

          <section className="border-t border-border pt-3">
            <h3 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-sell">
              <AlertTriangle className="h-3 w-3" /> Reset paper account
            </h3>
            <p className="mt-1.5 text-2xs leading-relaxed text-faint">
              Clears balances, positions, open orders, trade history, fees and PnL, then restores 50 SOL + 50 ETH.
              This cannot be undone.
            </p>
            <div className="mt-2 flex items-center gap-2">
              {confirmReset ? (
                <>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      reset();
                      setOpen(false);
                      toast({ title: "Paper account reset", description: "Balances restored to 50 SOL and 50 ETH.", variant: "info" });
                    }}
                  >
                    Confirm reset
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)}>
                  <RotateCcw className="h-3 w-3" /> Reset paper account
                </Button>
              )}
            </div>
          </section>

          <p className="border-t border-border pt-2 text-2xs text-faint">
            MEMESCOPE · build v1 · storage schema v1 · For market monitoring and simulation only.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
