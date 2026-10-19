import { AccountBar } from "@/components/shell/account-bar";
import { TopNavigation } from "@/components/layout/top-navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <TopNavigation />
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      <AccountBar />
      <footer className="border-t border-border bg-[#0b0b0b] px-2 py-1 text-[10px] text-faint">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-muted">MEMESCOPE paper terminal</span>
          <span>GeckoTerminal + DEX Screener (public APIs)</span>
          <span className="hidden sm:inline">Simulated orders only · no wallet, signature or real funds</span>
          <span className="ml-auto hidden md:inline">Not financial advice · security data not verified</span>
        </div>
      </footer>
    </div>
  );
}
