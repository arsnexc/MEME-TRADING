import type { NetworkId } from "@/lib/constants";

/** Canonical terminal URL for a pool/token pair. Shared by links outside discovery. */
export function terminalHrefFor(token: {
  network: NetworkId;
  pool: string;
  address: string;
}): string {
  return `/terminal?${new URLSearchParams({
    network: token.network,
    pool: token.pool,
    token: token.address,
  }).toString()}`;
}
