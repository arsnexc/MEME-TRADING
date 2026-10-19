import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { TerminalView } from "@/components/terminal/terminal-view";
import { buttonVariants } from "@/components/ui/button";
import { isNetworkId } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Terminal · MEMESCOPE",
  description: "Real GeckoTerminal charts and simulated paper trading for one memecoin pool.",
};

type TerminalSearchParams = {
  network?: string | string[];
  pool?: string | string[];
  token?: string | string[];
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function TerminalPage({
  searchParams,
}: {
  searchParams: Promise<TerminalSearchParams>;
}) {
  const params = await searchParams;
  const network = first(params.network);
  const pool = first(params.pool);
  const token = first(params.token);

  if (!network || !isNetworkId(network) || !pool) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={SearchX}
          title="No pool selected"
          description={
            <>
              Pick a token from discovery to open its terminal. A terminal URL needs a supported network and pool
              address, for example <span className="text-muted">/terminal?network=solana&amp;pool=…</span>.
            </>
          }
          action={
            <Link href="/" className={cn(buttonVariants({ variant: "primary", size: "sm" }))}>
              Browse discovery
            </Link>
          }
        />
      </div>
    );
  }

  return <TerminalView network={network} pool={pool} tokenAddress={token} />;
}
