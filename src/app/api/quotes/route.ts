import { NextResponse, type NextRequest } from "next/server";
import { jsonError, jsonOk, missingParam, readNetwork } from "@/lib/api";
import { fetchTokenQuotes, type QuoteRefInput } from "@/lib/market-data/service";
import type { NetworkId } from "@/lib/constants";

export const runtime = "nodejs";

const MAX_REFS = 90;
const MAX_POOL_LENGTH = 128;

/**
 * `GET /api/quotes?pools=solana:<pool>,solana:<pool>,eth:<pool>`
 *
 * Batched price polling for the portfolio and trackers. One upstream request per
 * network instead of one per token.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("pools")?.trim();
  if (!raw) return missingParam("pools");

  const refs: QuoteRefInput[] = [];
  for (const entry of raw.split(",")) {
    const separator = entry.indexOf(":");
    if (separator <= 0) continue;
    const network = readNetwork(entry.slice(0, separator)) as NetworkId | null;
    const pool = entry.slice(separator + 1).trim();
    if (!network || !pool || pool.length > MAX_POOL_LENGTH) continue;
    refs.push({ network, pool });
  }

  if (refs.length === 0) return missingParam("pools");
  if (refs.length > MAX_REFS) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: `At most ${MAX_REFS} pools can be refreshed per request.` } },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const data = await fetchTokenQuotes(refs);
    return jsonOk(data, 10);
  } catch (error) {
    return jsonError(error);
  }
}
