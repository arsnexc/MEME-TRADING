import Link from "next/link";
import { ArrowLeft, Construction } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Honest placeholder for surfaces that are visible in navigation but are not
 * backed by a real data source in this build. No demo numbers, no fake charts.
 */
export function FeatureUnavailable({
  title,
  summary,
  points,
}: {
  title: string;
  summary: string;
  points: string[];
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-sm border border-border bg-panel p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-sm border border-warn/30 bg-warn/10 text-warn">
            <Construction className="h-3.5 w-3.5" />
          </span>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-fg">{title}</h1>
            <p className="text-2xs text-faint">Not available in this build</p>
          </div>
          <Badge tone="warn" className="ml-auto">
            no data source
          </Badge>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted">{summary}</p>

        <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-2xs leading-relaxed text-muted">
          {points.map((point) => (
            <li key={point} className="flex gap-1.5">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-faint" aria-hidden="true" />
              <span>{point}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <Link href="/" className={cn(buttonVariants({ variant: "primary", size: "sm" }))}>
            <ArrowLeft className="h-3 w-3" /> Back to discovery
          </Link>
          <Link href="/pulse" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Market pulse
          </Link>
        </div>

        <p className="mt-3 border-t border-border pt-2 text-2xs text-faint">
          MEMESCOPE only shows data it can verify from its public market-data providers. Rather than fabricate a
          screen, this route states plainly that the feature is not implemented.
        </p>
      </div>
    </div>
  );
}
