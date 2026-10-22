import type { Metadata } from "next";
import { PortfolioView } from "@/components/portfolio/portfolio-view";

export const metadata: Metadata = {
  title: "Paper portfolio · MEMESCOPE",
  description: "Simulated SOL and ETH paper accounts, open positions, limit orders and fill history.",
};

export default function PortfolioPage() {
  return <PortfolioView />;
}
