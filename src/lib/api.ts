import { NextResponse } from "next/server";
import { isNetworkId, type NetworkId } from "@/lib/constants";
import { UpstreamError } from "@/lib/market-data/types";
import { rateLimitSnapshot } from "@/lib/market-data/upstream";

export function jsonOk<T>(data: T, cacheSeconds = 10): NextResponse<T> {
  const geo = rateLimitSnapshot("geckoterminal");
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": `public, max-age=0, s-maxage=${cacheSeconds}, stale-while-revalidate=30`,
      "X-Data-Source": "geckoterminal+dexscreener",
      "X-RateLimit-Remaining": String(geo.remaining),
      "X-RateLimit-Limit": String(geo.limit),
    },
  });
}

export function jsonError(error: unknown, fallbackMessage = "Market data is unavailable."): NextResponse {
  const upstream = error instanceof UpstreamError ? error : null;
  const status = upstream?.status ?? 502;
  const message = upstream?.message ?? (error instanceof Error ? error.message : fallbackMessage);
  const retryAfterMs = upstream?.retryAfterMs ?? null;
  return NextResponse.json(
    {
      error: {
        code: upstream?.code ?? "upstream_error",
        message,
        provider: upstream?.provider ?? "market-data",
        retryAfterMs,
      },
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(status === 429
          ? { "Retry-After": String(Math.max(1, Math.ceil((retryAfterMs ?? 15_000) / 1000))) }
          : {}),
      },
    },
  );
}

export function readNetwork(value: string | null): NetworkId | null {
  return isNetworkId(value) ? value : null;
}

export function missingParam(name: string): NextResponse {
  return NextResponse.json({ error: { code: "invalid_request", message: `Missing or invalid \`${name}\`.` } }, { status: 400 });
}
