import type { NextRequest } from "next/server";
import { jsonError, jsonOk, missingParam, readNetwork } from "@/lib/api";
import { fetchTrades } from "@/lib/market-data/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const network = readNetwork(searchParams.get("network"));
  const pool = searchParams.get("pool")?.trim();
  const limit = Number(searchParams.get("limit") ?? 100);
  if (!network) return missingParam("network");
  if (!pool) return missingParam("pool");

  try {
    const data = await fetchTrades({ network, pool, limit: Number.isFinite(limit) ? limit : 100 });
    return jsonOk(data, 10);
  } catch (error) {
    return jsonError(error);
  }
}
