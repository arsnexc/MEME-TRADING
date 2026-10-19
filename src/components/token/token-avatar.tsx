"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function TokenAvatar({
  src,
  symbol,
  size = 24,
  className,
}: {
  src: string | null | undefined;
  symbol: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-panel-2 text-[10px] font-semibold uppercase text-muted",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src ?? undefined}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        symbol.slice(0, 2) || "?"
      )}
    </div>
  );
}
