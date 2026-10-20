export type NetworkId = "solana" | "eth" | "base";
export type QuoteCurrency = "SOL" | "ETH";

export interface NetworkConfig {
  id: NetworkId;
  label: string;
  shortLabel: string;
  quote: QuoteCurrency;
  geckoId: string;
  dexscreenerId: string;
  explorerName: string;
  tokenUrl: (address: string) => string;
  txUrl: (hash: string) => string;
  color: string;
}

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  solana: {
    id: "solana",
    label: "Solana",
    shortLabel: "SOL",
    quote: "SOL",
    geckoId: "solana",
    dexscreenerId: "solana",
    explorerName: "Solscan",
    tokenUrl: (address) => `https://solscan.io/token/${address}`,
    txUrl: (hash) => `https://solscan.io/tx/${hash}`,
    color: "#e5e5e5",
  },
  eth: {
    id: "eth",
    label: "Ethereum",
    shortLabel: "ETH",
    quote: "ETH",
    geckoId: "eth",
    dexscreenerId: "ethereum",
    explorerName: "Etherscan",
    tokenUrl: (address) => `https://etherscan.io/token/${address}`,
    txUrl: (hash) => `https://etherscan.io/tx/${hash}`,
    color: "#a3a3a3",
  },
  base: {
    id: "base",
    label: "Base",
    shortLabel: "BASE",
    quote: "ETH",
    geckoId: "base",
    dexscreenerId: "base",
    explorerName: "Basescan",
    tokenUrl: (address) => `https://basescan.org/token/${address}`,
    txUrl: (hash) => `https://basescan.org/tx/${hash}`,
    color: "#737373",
  },
};

export const SUPPORTED_NETWORKS = Object.values(NETWORKS);
export const SUPPORTED_NETWORK_IDS = Object.keys(NETWORKS) as NetworkId[];
export const QUOTE_CURRENCIES: QuoteCurrency[] = ["SOL", "ETH"];

export function isNetworkId(value: unknown): value is NetworkId {
  return typeof value === "string" && value in NETWORKS;
}

export function networkQuote(network: NetworkId): QuoteCurrency {
  return NETWORKS[network].quote;
}

/** Reference token addresses used to price each paper account's quote currency in USD. */
export const QUOTE_REFERENCE = {
  SOL: {
    network: "solana" as NetworkId,
    address: "So11111111111111111111111111111111111111112",
  },
  ETH: {
    network: "eth" as NetworkId,
    address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  },
} as const;

export type ScannerTimeframe = "m5" | "m15" | "m30" | "h1" | "h6" | "h24";
export const SCANNER_TIMEFRAMES: { value: ScannerTimeframe; label: string }[] = [
  { value: "m5", label: "5m" },
  { value: "m15", label: "15m" },
  { value: "m30", label: "30m" },
  { value: "h1", label: "1h" },
  { value: "h6", label: "6h" },
  { value: "h24", label: "24h" },
];

/** "h24" is a storage key; the UI always shows "24h". */
export function scannerTimeframeLabel(value: ScannerTimeframe): string {
  return SCANNER_TIMEFRAMES.find((item) => item.value === value)?.label ?? value;
}

export type ChartTimeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
export const CHART_TIMEFRAMES: { value: ChartTimeframe; label: string }[] = [
  { value: "1m", label: "1m" },
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
  { value: "4h", label: "4h" },
  { value: "1d", label: "1d" },
];

export type DisplayCurrency = "USD" | QuoteCurrency;
export const DISPLAY_CURRENCIES: DisplayCurrency[] = ["USD", "SOL", "ETH"];

export type DiscoveryTab = "top" | "trending" | "radar" | "callouts" | "streamers";
export const DISCOVERY_TABS: { value: DiscoveryTab; label: string; badge?: string }[] = [
  { value: "top", label: "Top volume" },
  { value: "trending", label: "Trending" },
  { value: "radar", label: "New pools", badge: "NEW" },
  { value: "callouts", label: "My notes" },
  { value: "streamers", label: "Streamers" },
];

export const APP_NAME = "MEMESCOPE";
export const PAPER_TRADING_DISCLOSURE =
  "Paper trading only. No wallet is connected, no transactions are signed, and no real funds are at risk.";
