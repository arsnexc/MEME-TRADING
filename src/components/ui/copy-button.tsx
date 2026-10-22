"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn, copyToClipboard } from "@/lib/utils";
import { Tooltip } from "./tooltip";

export function CopyButton({
  value,
  label = "Copy address",
  className,
  showLabel = false,
}: {
  value: string;
  label?: string;
  className?: string;
  showLabel?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip content={copied ? "Copied" : label}>
      <button
        type="button"
        aria-label={copied ? "Copied to clipboard" : label}
        className={cn(
          "inline-flex items-center gap-1 rounded-[2px] text-faint transition-colors hover:text-fg",
          className,
        )}
        onClick={async (event) => {
          event.stopPropagation();
          try {
            await copyToClipboard(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1_400);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <Check className="h-3 w-3 text-buy" /> : <Copy className="h-3 w-3" />}
        {showLabel ? <span className="text-2xs">{copied ? "Copied" : "Copy"}</span> : null}
      </button>
    </Tooltip>
  );
}
