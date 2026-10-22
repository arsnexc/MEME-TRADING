import { ExternalLink, Globe, MessageCircle, Send } from "lucide-react";
import type { SocialLink } from "@/lib/market-data/types";
import { cn, truncateMiddle } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

function iconFor(type: string) {
  const normalized = type.toLowerCase();
  if (normalized.includes("twitter") || normalized === "x") return ExternalLink;
  if (normalized.includes("telegram")) return Send;
  if (normalized.includes("discord")) return MessageCircle;
  return Globe;
}

export function SocialLinks({
  socials,
  websites,
  className,
}: {
  socials: SocialLink[];
  websites?: string[];
  className?: string;
}) {
  if (socials.length === 0 && (websites?.length ?? 0) === 0) return null;
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {(websites ?? []).slice(0, 1).map((url) => (
        <Tooltip key={url} content={`Website · ${truncateMiddle(url.replace(/^https?:\/\//, ""), 22, 8)}`}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            onClick={(event) => event.stopPropagation()}
            className="rounded-[2px] p-0.5 text-faint transition-colors hover:text-fg"
            aria-label="Open project website"
          >
            <Globe className="h-3 w-3" />
          </a>
        </Tooltip>
      ))}
      {socials.slice(0, 2).map((social) => {
        const Icon = iconFor(social.type);
        return (
          <Tooltip key={`${social.type}-${social.url}`} content={`${social.type} · ${truncateMiddle(social.url, 26, 6)}`}>
            <a
              href={social.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              onClick={(event) => event.stopPropagation()}
              className="rounded-[2px] p-0.5 text-faint transition-colors hover:text-fg"
              aria-label={`Open ${social.type} link`}
            >
              <Icon className="h-3 w-3" />
            </a>
          </Tooltip>
        );
      })}
    </div>
  );
}
