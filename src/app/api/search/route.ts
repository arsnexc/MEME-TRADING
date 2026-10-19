import type { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { fetchSearch } from "@/lib/market-data/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim().slice(0, 80);
  if (query.length < 2) {
    return jsonOk({ tokens: [], fetchedAt: Date.now(), query }, 5);
  }
  try {
    const data = await fetchSearch(query);
    return jsonOk(data, 10);
  } catch (error) {
    return jsonError(error);
  }
}
