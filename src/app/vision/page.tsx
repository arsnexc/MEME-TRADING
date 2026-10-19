import type { Metadata } from "next";
import { FeatureUnavailable } from "@/components/layout/feature-unavailable";

export const metadata: Metadata = { title: "Vision · MEMESCOPE" };

export default function VisionPage() {
  return (
    <FeatureUnavailable
      title="Vision"
      summary="Vision is a planned chart-and-thesis workspace. No vision model is integrated here, and the app does not generate trading signals or price predictions."
      points={[
        "No image model, LLM endpoint or API key is configured in this deployment.",
        "The existing chart shows real OHLCV from GeckoTerminal; the paper engine executes only on those prices.",
        "Anything labelled as AI analysis elsewhere is not part of this build and should not be trusted.",
      ]}
    />
  );
}
