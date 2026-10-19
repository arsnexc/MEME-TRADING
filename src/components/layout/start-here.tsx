"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "memescope.start-here.dismissed.v1";

const STEPS = [
  { title: "Pick a token", body: "Open any row to see its live chart, trades and pool stats." },
  { title: "Trade it", body: "Buy or sell with imaginary SOL or ETH. No wallet, nothing on-chain." },
  { title: "Set an auto exit", body: "Add a take profit or stop loss and the position closes itself." },
];

/**
 * Short onboarding strip for first-time visitors. The app trades with pretend
 * money, so the fastest way to explain it is three concrete steps. Dismissal is
 * remembered locally; nothing is sent anywhere.
 */
export function StartHere() {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);

  if (hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Private mode: it simply shows again next time.
    }
  };

  return (
    <section
      aria-label="How paper trading works"
      className="relative border-b border-border bg-panel/60 px-2.5 py-2 sm:px-3"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <p className="text-2xs font-semibold uppercase tracking-wide text-muted">New here?</p>
        <ol className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-2xs">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex min-w-0 items-baseline gap-1.5">
              <span className="num flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border-strong text-[9px] text-muted">
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="font-medium text-fg">{step.title}</span>
                <span className="text-faint"> — {step.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <Link href="/portfolio" className={cn(buttonVariants({ variant: "outline", size: "xs" }), "shrink-0")}>
          Open portfolio <ArrowRight className="h-2.5 w-2.5" />
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss getting-started tips"
          className="rounded-[2px] p-0.5 text-faint transition-colors hover:text-fg"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </section>
  );
}
