import { NETWORKS, type NetworkId } from "@/lib/constants";
import { cn } from "@/lib/utils";

const TONE: Record<NetworkId, string> = {
  solana: "border-[#9945FF]/30 bg-[#9945FF]/10 text-[#c9a6ff]",
  eth: "border-[#627EEA]/30 bg-[#627EEA]/10 text-[#aab8ff]",
  base: "border-[#0052FF]/35 bg-[#0052FF]/10 text-[#8fb3ff]",
};

export function NetworkBadge({ network, className }: { network: NetworkId; className?: string }) {
  const config = NETWORKS[network];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-[2px] border px-1 py-0.5 text-2xs font-medium leading-none",
        TONE[network],
        className,
      )}
    >
      <span className="h-1 w-1 rounded-full" style={{ backgroundColor: config.color }} />
      {config.shortLabel}
    </span>
  );
}
