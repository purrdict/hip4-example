# HIP-4 SDK Example

A minimal Next.js 15 app demonstrating HIP-4 prediction markets on Hyperliquid testnet.

## What it shows

- Live recurring prediction markets (BTC, ETH, SOL, HYPE) via WebSocket
- Real-time price feed via `allMids` subscription
- Wallet connection (wagmi + injected connector)
- Live orderbook for any market
- Trade form (Buy/Sell Yes/No shares)

## Tech stack

- **Next.js 15** — App Router, server components by default
- **wagmi v2 + viem** — wallet connection, no Privy
- **Tailwind CSS v4** — utility-first styling
- **Zustand** — external store pattern with `useSyncExternalStore`
- **Hyperliquid Testnet** — `https://api.hyperliquid-testnet.xyz`

## Key patterns

### Singleton WebSocket client (NOT in a component)
```typescript
// src/lib/ws-client.ts
class HyperWsClient { ... }
export const wsClient = new HyperWsClient(); // created once at module level
```

### Market store with useSyncExternalStore
```typescript
// src/hooks/use-markets.ts
export function useMarkets() {
  const state = useSyncExternalStore(
    subscribeMarkets,
    getMarketSnapshot,
    () => ({ markets: [], status: "idle" }) // server snapshot
  );
  useEffect(() => { initMarkets(); }, []); // lifecycle only
  return state;
}
```

### Trade in event handler (NOT useEffect)
```typescript
const handleSubmit = async (e: FormEvent) => {
  e.preventDefault();
  // sign + submit order here, in an onClick handler
};
```

## Running locally

```bash
bun install
bun run dev   # starts on localhost:3003
```

## Testnet

All activity is on Hyperliquid testnet. No real funds involved.

- API: `https://api.hyperliquid-testnet.xyz`
- WS: `wss://api.hyperliquid-testnet.xyz/ws`

## Important notes

- **Agent keys**: The demo generates a local agent key per wallet session. In production, register it on-chain via `approveAgent` first.
- **Order format**: Uses legacy asset format `a = 100000000 + coinNum` for prediction market orders.
- **Tick size**: Prices use 5 significant figures (`tick = 10^(floor(log10(price)) - 4)`).
- **Min shares**: ~20 shares (depends on current price; ~0.20 USDH minimum).

## Learn more

- [Purrdict](https://purrdict.xyz) — the full prediction markets app
- [Hyperliquid Docs](https://hyperliquid.gitbook.io/hyperliquid-docs/)
