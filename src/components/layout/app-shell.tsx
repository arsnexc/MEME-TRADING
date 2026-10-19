import { TopNavigation } from "@/components/layout/top-navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <TopNavigation />
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      <footer className="border-t border-border px-3 py-1.5 text-2xs text-faint">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-muted">MEMESCOPE paper terminal</span>
          <span>Data: GeckoTerminal + DEX Screener (public APIs)</span>
          <span className="hidden sm:inline">Orders are simulated. No wallet connection, signatures or real funds.</span>
          <span className="ml-auto hidden md:inline">Not financial advice · security data not verified</span>
        </div>
      </footer>
    </div>
  );
}
