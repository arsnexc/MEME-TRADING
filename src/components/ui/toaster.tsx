"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useToastStore, type ToastVariant } from "@/stores/toast";
import { cn } from "@/lib/utils";

const ICONS: Record<ToastVariant, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const TONES: Record<ToastVariant, string> = {
  success: "border-buy/30 text-buy",
  error: "border-sell/30 text-sell",
  warning: "border-warn/30 text-warn",
  info: "border-accent/30 text-accent",
};

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div
      className="pointer-events-none fixed bottom-3 right-3 z-[100] flex w-[min(360px,calc(100vw-1.5rem))] flex-col gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((item) => {
        const Icon = ICONS[item.variant];
        return (
          <div
            key={item.id}
            role="status"
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-sm border bg-[#0a0a0a] p-2.5 shadow-2xl shadow-black/50 animate-fade",
              TONES[item.variant],
            )}
          >
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-fg">{item.title}</p>
              {item.description ? (
                <p className="mt-0.5 text-2xs leading-relaxed text-muted">{item.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(item.id)}
              className="rounded-[2px] p-0.5 text-faint hover:text-fg"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
