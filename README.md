# MEMESCOPE — memecoin discovery + paper-trading terminal

MEMESCOPE is a Next.js app that pairs **real, provider-sourced memecoin market data** with a **fully simulated paper-trading account**. It is a trading terminal, not a signal service: charts, trades, metrics and prices come from public APIs, while every order is executed locally against a fictional balance. No wallet is connected, nothing is signed, and no real funds can move.

> Paper trading only. Nothing in this app is financial advice.

---

## What is in the build

| Area | What it does |
| --- | --- |
| **Discover** | Cross-chain scanner (Solana, Ethereum, Base) with trending / top-volume / newest-pool tabs, search, network filters, liquidity filter, sorting, pagination, saved trackers. |
| **Terminal** | `/terminal?network=…&pool=…&token=…` — token header with live metrics and security hints, real OHLCV candlestick chart, market trades, top-trader and early-buyer aggregates derived from the fetched trade window, positions, limit orders, local callouts, and a full paper order ticket. |
| **Paper execution** | Market buys/sells, resting limit orders monitored in the background, advanced fee/priority-fee simulation, fee-aware previews, validation, per-quote accounts. |
| **Portfolio** | `/portfolio` — SOL and ETH accounts shown separately, equity, realized/unrealized PnL, open positions, limit orders, fill history, JSON export, guarded reset. |
| **Pulse** | `/pulse` — volume leaders, top movers and freshly created pools, with provider caveats stated in the UI. |
| **Trackers** | `/trackers` — locally saved tokens and private callout notes, with live prices for the first 12 entries. |
| **Honest placeholders** | `/perpetuals`, `/predictions`, `/vision` state plainly that no data source or model is connected instead of fabricating screens. |

### Data honesty rules enforced in the code

- **No synthetic candles.** The chart only renders OHLCV returned by GeckoTerminal. If the provider fails, the UI shows an error/stale state, not a generated series.
- **No invented holders, dev wallets, insiders or security scores.** Holder concentration, creator identity and dev-token history require an indexer that is not configured; those tabs explain the gap. Locked-liquidity percentage is shown only when GeckoTerminal reports it.
- **Explicit provenance.** Every market response carries a source and a timestamp. The terminal shows proxy vs. direct transport, price age, stale data and provider warnings.
- **Trade-window caveat.** “Top traders” / “early buyers” are aggregates over the trades the provider returned (a capped window), not a complete ledger. The UI says so.
- **Market cap vs FDV.** When circulating supply is unavailable, the market cap is the FDV and is labelled `FDV (supply unknown)`.

### Data providers

| Provider | Used for | Limits respected |
| --- | --- | --- |
| [GeckoTerminal](https://www.geckoterminal.com/dex-api) | Pool lists, pool detail, real OHLCV, trades, locked liquidity | 30 req/min documented; limiter caps at 24/min |
| [DEX Screener](https://docs.dexscreener.com/api/reference) | Logos, socials, circulating market cap, liquidity, search, SOL/ETH reference prices | 300 req/min documented; limiter caps at 200/min |

Both are public and keyless. GeckoTerminal's budget is the scarce one, so it is reserved for pools, candles and trades: a discovery refresh costs **one GeckoTerminal call per requested network**, and SOL/ETH reference prices ride along in the DEX Screener batch that already fetches logos. A terminal page costs seven GeckoTerminal calls per minute (pool 30 s, candles 20 s, trades 30 s).

### When a provider rate-limits

The limiter is designed to degrade instead of blanking the screen:

1. **Bounded queue** — if the local window is full, a request waits up to 2.5 s for the oldest slot to age out before returning `429`.
2. **Cooldown** — an upstream `429` (with `Retry-After` when sent) pauses that provider for 15 s, doubling up to 120 s on repeated strikes. Later calls fail fast and never hammer upstream.
3. **Stale data** — expired cache entries are still served with `stale: true`; pool lists also revalidate in the background, so the scanner keeps rendering while a refresh is in flight.
4. **Client backoff** — the polling hooks honour `retryAfterMs`, back off exponentially for rate limits, and show a live *“retrying in Ns”* countdown. Manual refresh always overrides the timer.
5. **Typed errors** — the JSON error body carries `retryAfterMs` and the response sets `Retry-After`, so any client can back off correctly.

Requests are cached in-memory with single-flight de-duplication, so concurrent tabs and identical polls do not multiply upstream calls.

---

## Paper-trading model

- **Separate accounts.** A Solana account starts with **50 SOL** and an Ethereum account with **50 ETH**. A Base token trades in the ETH account. Accounts never convert into each other.
- **Notional = entered quote amount.** Quantity is notional ÷ simulated fill price.
- **Fee convention.** `fee = notional × feeRate`; the fee is expensed immediately and tracked separately from cost basis. Default **0.50%** per side; configurable 0–5% in advanced mode.
- **Slippage.** Buy fill = reference × (1 + slippage); sell fill = reference × (1 − slippage). Presets: **0.5%, 1%, 5%, 20%**.
- **Priority fee (advanced).** Added to the buy debit only and recorded as a fee; it is not a real network payment. Sells model the execution fee only.
- **Unrealized PnL** subtracts the estimated exit fee: `marketValue − costBasis − exitFee`.
- **Realized PnL** = net proceeds − quantity × average entry price.
- **Limit orders** fill only when a fresh provider tick crosses the limit; they fill **at the limit price** with the fee rate and slippage captured at placement. Orders are monitored every 25 seconds while the app is open (`PriceWatcher`), never on stale snapshots.
- **Price freshness.** Orders are blocked when the last price is older than 60 seconds. Stale positions are marked and selling is disabled until a fresh price arrives.
- **Persistence.** Accounts, positions, orders, trades, watchlist and callouts live in versioned `localStorage` (`memescope.*.v1`). Every restored snapshot is validated field-by-field; corrupted payloads are dropped in favour of a fresh account rather than rendered.

---

## Stack

- Next.js **15.5** (App Router, route handlers) + React **19**
- TypeScript **5.9** (strict)
- Tailwind CSS **4**
- Zustand **5** with a custom validated persistence adapter
- `lightweight-charts` **5.2** for candles, volume overlay and paper-fill markers
- Radix primitives (tabs, dialog, tooltip, popover)
- Vitest **3** + Testing Library + jsdom

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

Node.js 20+ recommended (developed on Node 22).

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (flat config) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Vitest run (45 tests) |
| `npm run check` | typecheck + lint + test |

### Environment variables

**None are required.** The app uses only public, keyless APIs. Do not add wallet secrets, private keys or API tokens to this repository. If a future provider needs a key, put it in the deployment platform's environment and call it from a server route only.

---

## Architecture

```
src/
  app/
    page.tsx                     Discovery scanner
    terminal/page.tsx            Terminal shell (reads network/pool/token)
    portfolio|pulse|trackers/    Account, market-pulse and watchlist pages
    perpetuals|predictions|vision/  Honest unavailable surfaces
    api/
      markets/ token/ ohlcv/ trades/ search/ quote-prices/
  components/
    discovery/  terminal/  portfolio/  pulse/  trackers/
    ui/         shared primitives (buttons, tabs, dialogs, tooltip…)
    layout/     shell, navigation, search, settings
  lib/
    market-data/  upstream client, GeckoTerminal, DEX Screener,
                  normalization, service layer, browser proxy/direct client
    trading/      decimal-safe engine, validation, persistence sanitizer
    formatting/   USD, quote-currency and compact number formatting
  hooks/          polling query, token price tracker, now, display currency
  stores/         paper account, market snapshots, preferences, watchlist, callouts
tests/            engine, normalization, service, UI and execution tests
```

### API surface

All routes return JSON and validate input.

| Route | Params | Response |
| --- | --- | --- |
| `GET /api/markets` | `tab=trending\|top\|radar\|streamers`, `networks=solana,eth,base` | `{ tokens, tab, fetchedAt, quotePrices, stale, warnings }` |
| `GET /api/token` | `network`, `pool`, optional `token` | `{ market, dexName, quotePrices, fetchedAt, stale, warnings }` |
| `GET /api/ohlcv` | `network`, `pool`, `timeframe=1m\|5m\|15m\|1h\|4h\|1d` | `{ candles, timeframe, fetchedAt, stale, source, warnings }` |
| `GET /api/quotes` | `pools` — comma-separated `network:pool` refs (≤ 30 per network, ≤ 90 total) | `{ tokens, quotePrices, fetchedAt, stale, warnings }` |
| `GET /api/trades` | `network`, `pool`, optional `limit` (10–300) | `{ trades, fetchedAt, stale, warnings, window }` |
| `GET /api/search` | `q` (min 2 chars) | `{ tokens, fetchedAt, query }` |
| `GET /api/quote-prices` | — | `{ prices: { SOL, ETH, fetchedAt }, warnings }` |

Errors use a consistent shape:

```json
{ "error": { "code": "rate_limited", "message": "…", "provider": "geckoterminal", "retryAfterMs": 15000 } }
```

`400` invalid input, `404` unknown pool/token, `429` provider or local rate limit (`Retry-After` in seconds, plus `retryAfterMs` in the body), `502/504` upstream failure. Successful responses expose `X-RateLimit-Remaining` / `X-RateLimit-Limit` for the server's GeckoTerminal window.

### Browser transport

The browser calls the Next.js proxy first. If the proxy is unreachable (cold start, offline preview sandbox, upstream outage), the client falls back to the same public providers directly and labels the response as `direct`. This is the only fallback: it never substitutes demo data. The shared service layer means proxy and direct paths normalize identically.

---

## Tests

The suite runs in Node/jsdom with mocked upstream responses:

- **`tests/trading.test.ts`** — decimal normalisation, input validation, buy/sell plans, fees and slippage, priority fees, limit triggers, unrealized PnL, store lifecycle (buy → mark → partial/full sell), per-quote isolation, insufficient balance, limit fills, cancellation, reset and persistence validation.
- **`tests/market-data.test.ts`** — normalization/merge of GeckoTerminal + DEX Screener payloads, FDV labelling, pair selection, dedupe, sorting/filtering/pagination, mocked service calls for markets, OHLCV dedupe/sort, trade side mapping, 429 mapping and network-filter validation.
- **`tests/rate-limit.test.ts`** — local window exhaustion, cooldown after an upstream 429, cached responses not consuming budget, batched multi-pool quote refresh (one GeckoTerminal call for many pools), and SOL/ETH reference prices derived from DEX Screener instead of GeckoTerminal.
- **`tests/ui.test.tsx`** — positions table (live vs stale sell blocking), order cancellation, callout limits and local save.
- **`tests/execution.test.tsx`** — full market-buy flow through the order ticket, stale-price blocking, balance validation, limit placement, sell-without-position messaging.

Not covered: a real browser E2E run and a live-provider integration run (the build environment has no browser binaries and no outbound access to the market APIs). The chart component is not exercised in jsdom because canvas is unavailable; its data/error states are covered by the service layer tests.

---

## Known limitations

- **Polling, not WebSockets.** Prices refresh every 20–45 s depending on the surface; limit orders check every 25 s while a tab is open. Background monitoring stops when the app is closed. Portfolios and trackers poll through `/api/quotes`, which batches up to 30 pools per network into one upstream request.
- **Trades are a provider-capped window.** Top-trader/early-buyer tables are derived from the returned page of trades, not a complete audit of the pool.
- **No holder/creator/security oracle.** Holder concentration, mint/freeze authority status, dev holdings and bundle analysis are shown as unknown unless the provider exposes them (only locked liquidity is available).
- **No derivatives, prediction markets or AI vision.** Those routes explain the missing integration rather than inventing data.
- **Provider availability.** Public APIs can rate-limit or fail. The UI keeps the last good snapshot, labels it stale, and shows a retry countdown — it never fills the gap with demo data. If GeckoTerminal is fully exhausted, new pools cannot be listed because neither provider offers a keyless “all trending pools” endpoint.
- **Display currency conversion** uses the provider's SOL/USD and ETH/USD references. If a reference is missing, the app stays in USD and says so.
- **Local-only state.** Clearing browser storage resets the paper account and trackers. Export JSON before resetting if you want a record.

## Deployment

The app is a standard Next.js build and deploys to Vercel without extra configuration (no environment variables, no database). The in-memory cache and rate limiter are per server instance; that is deliberate for a public, keyless app. For a durable multi-instance deployment, swap `src/lib/market-data/upstream.ts` for a shared cache (e.g. Redis) without changing the service interfaces.

## Safety and privacy

- No wallet connection, no signatures, no deposits/withdrawals, no on-chain transactions.
- No analytics, tracking scripts or external fonts are bundled.
- Account data stays in the browser. The only network calls are to the app's own routes and, in fallback mode, the two public market-data providers.
- This is an educational simulation, not a broker, exchange, investment adviser or prediction service.
