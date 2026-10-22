import { NETWORKS, type NetworkId } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** One quiet treatment for every chain: the label carries the meaning. */
const TONE = "border-border bg-panel-2 text-muted";

export function NetworkBadge({ network, className }: { network: NetworkId; className?: string }) {
  const config = NETWORKS[network];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-[2px] border px-1 py-0.5 text-2xs font-medium leading-none",
        TONE,
        className,
      )}
    >
      <span className="h-1 w-1 rounded-full" style={{ backgroundColor: config.color }} />
      {config.shortLabel}
    </span>
  );
}
