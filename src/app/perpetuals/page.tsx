import type { Metadata } from "next";
import { FeatureUnavailable } from "@/components/layout/feature-unavailable";

export const metadata: Metadata = { title: "Perpetuals · MEMESCOPE" };

export default function PerpetualsPage() {
  return (
    <FeatureUnavailable
      title="Perpetual futures"
      summary="This build is a spot-only paper terminal. No perpetual-futures venue, funding-rate feed or liquidation engine is integrated, so there is no honest way to show positions or PnL here."
      points={[
        "No exchange API keys and no derivatives data provider are configured.",
        "Leverage, funding and liquidation would change the risk model; blending them into the spot paper account would be misleading.",
        "Simulated spot buys, sells and limit orders remain fully functional in the terminal and portfolio.",
      ]}
    />
  );
}
