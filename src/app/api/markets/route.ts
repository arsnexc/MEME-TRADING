import type { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { fetchMarkets, parseNetworks } from "@/lib/market-data/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab") ?? "trending";
  const networks = parseNetworks(searchParams.get("networks"));
  try {
    const data = await fetchMarkets({ tab, networks });
    return jsonOk(data, 20);
  } catch (error) {
    return jsonError(error);
  }
}
