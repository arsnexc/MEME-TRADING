import { jsonError, jsonOk } from "@/lib/api";
import { fetchQuotePrices } from "@/lib/market-data/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const data = await fetchQuotePrices();
    return jsonOk(data, 30);
  } catch (error) {
    return jsonError(error);
  }
}
