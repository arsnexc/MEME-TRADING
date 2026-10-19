"use client";

import { useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { PriceWatcher } from "@/components/market/price-watcher";
import { useCalloutStore } from "@/stores/callouts";
import { useHydrationStore } from "@/stores/hydration";
import { usePaperStore } from "@/stores/paper-trading";
import { usePreferencesStore } from "@/stores/preferences";
import { useWatchlistStore } from "@/stores/watchlist";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      if (!cancelled) useHydrationStore.getState().markHydrated();
    };

    const unsubscribers = [
      usePaperStore.persist.onFinishHydration(finish),
      usePreferencesStore.persist.onFinishHydration(finish),
      useWatchlistStore.persist.onFinishHydration(finish),
      useCalloutStore.persist.onFinishHydration(finish),
    ];

    try {
      void Promise.all([
        Promise.resolve(usePaperStore.persist.rehydrate()),
        Promise.resolve(usePreferencesStore.persist.rehydrate()),
        Promise.resolve(useWatchlistStore.persist.rehydrate()),
        Promise.resolve(useCalloutStore.persist.rehydrate()),
      ]).finally(finish);
    } catch {
      finish();
    }
    // Safety net: never leave the UI in a permanent loading state.
    const timeout = setTimeout(finish, 1_500);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, []);

  return (
    <TooltipProvider delayDuration={180} skipDelayDuration={400}>
      {children}
      <PriceWatcher />
      <Toaster />
    </TooltipProvider>
  );
}
