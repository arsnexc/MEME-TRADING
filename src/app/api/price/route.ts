import { NextResponse, type NextRequest } from "next/server";
import { jsonError, missingParam, readNetwork } from "@/lib/api";
import { fetchPoolPrice } from "@/lib/market-data/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/price?network=solana&pool=...`
 *
 * Single-pool live price for the chart ticker. Never cached: the whole point is
 * a price that is newer than the 20–30 s list/OHLCV polls. `no-store` also keeps
 * the Vercel edge from serving one visitor's tick to another.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const network = readNetwork(searchParams.get("network"));
  if (!network) return missingParam("network");
  const pool = searchParams.get("pool")?.trim();
  if (!pool) return missingParam("pool");

  try {
    const data = await fetchPoolPrice(network, pool);
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Data-Source": data.source,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
