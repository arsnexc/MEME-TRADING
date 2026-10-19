import type { Metadata } from "next";
import { PulseView } from "@/components/pulse/pulse-view";

export const metadata: Metadata = {
  title: "Market pulse · MEMESCOPE",
  description: "Trending pools, volume leaders, top movers and freshly-created memecoin pools across Solana, Ethereum and Base.",
};

export default function PulsePage() {
  return <PulseView />;
}
