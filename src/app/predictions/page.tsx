import type { Metadata } from "next";
import { FeatureUnavailable } from "@/components/layout/feature-unavailable";

export const metadata: Metadata = { title: "Predictions · MEMESCOPE" };

export default function PredictionsPage() {
  return (
    <FeatureUnavailable
      title="Prediction markets"
      summary="Prediction-market contracts are not connected in this build. There is no order book, resolution feed or settlement data to display."
      points={[
        "No prediction-market venue is queried, so no market odds are shown.",
        "Any odds or payoff figures in this app would be fabricated; the product deliberately avoids that.",
        "Use the market pulse and token terminal for real, provider-sourced spot data.",
      ]}
    />
  );
}
