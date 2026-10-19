import type { Metadata } from "next";
import { TrackersView } from "@/components/trackers/trackers-view";

export const metadata: Metadata = {
  title: "Trackers · MEMESCOPE",
  description: "Local watchlist and callout notes for memecoin pools across Solana, Ethereum and Base.",
};

export default function TrackersPage() {
  return <TrackersView />;
}
