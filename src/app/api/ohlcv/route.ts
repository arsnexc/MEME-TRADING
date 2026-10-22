import type { NextRequest } from "next/server";
import { jsonError, jsonOk, missingParam, readNetwork } from "@/lib/api";
import { CHART_TIMEFRAMES, type ChartTimeframe } from "@/lib/constants";
import { fetchOhlcv } from "@/lib/market-data/service";

export const runtime = "nodejs";

const TIMEFRAMES = CHART_TIMEFRAMES.map((t) => t.value);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const network = readNetwork(searchParams.get("network"));
  const pool = searchParams.get("pool")?.trim();
  const timeframeParam = searchParams.get("timeframe") ?? "5m";
  if (!network) return missingParam("network");
  if (!pool) return missingParam("pool");
  if (!TIMEFRAMES.includes(timeframeParam as ChartTimeframe)) return missingParam("timeframe");
  const timeframe = timeframeParam as ChartTimeframe;

  try {
    const data = await fetchOhlcv({ network, pool, timeframe });
    return jsonOk(data, 15);
  } catch (error) {
    return jsonError(error);
  }
}
