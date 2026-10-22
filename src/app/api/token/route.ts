import type { NextRequest } from "next/server";
import { jsonError, jsonOk, missingParam, readNetwork } from "@/lib/api";
import { fetchTokenDetail } from "@/lib/market-data/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const network = readNetwork(searchParams.get("network"));
  const pool = searchParams.get("pool")?.trim();
  const token = searchParams.get("token")?.trim() || null;
  if (!network) return missingParam("network");
  if (!pool) return missingParam("pool");

  try {
    const data = await fetchTokenDetail({ network, pool, token });
    return jsonOk(data, 10);
  } catch (error) {
    return jsonError(error);
  }
}
