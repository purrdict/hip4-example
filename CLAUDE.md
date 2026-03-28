# HIP-4 Example App

Reference React app demonstrating how to use @purrdict/hip4 SDK and hip4-ui components.
Published at github.com/purrdict/hip4-example.

## Quick Start
```bash
cd apps/hip4-example
bun install
bun run dev    # starts on port 3003
```

## Patterns Used
- **useSyncExternalStore** for WebSocket price data (NOT useEffect)
- **wagmi** for wallet connection (wallet agnostic, no Privy/RainbowKit)
- **zustand** for market store (market-store.ts)
- **@nktkas/hyperliquid** for network I/O (API calls, WebSocket)
- **@tanstack/react-query** for async data fetching

## Structure
```
src/
  app/             Next.js App Router pages
  components/      UI components (connect-button, market-list, market-detail)
  hooks/           Custom hooks (use-markets.ts)
  lib/             Core logic (api.ts, market-store.ts, wagmi.ts, ws-client.ts)
  types/           TypeScript types
```

## Key Files
- `src/lib/market-store.ts` — zustand store with WS feed, market building
- `src/lib/ws-client.ts` — WebSocket client for allMids subscription
- `src/lib/api.ts` — Hyperliquid API client (outcomeMeta, allMids, etc.)
- `src/hooks/use-markets.ts` — React hook bridging store to components
- `src/components/market-list.tsx` — market grid with live prices

## Notes
- This is a **private repo** (not published to npm), intended as a cloneable reference
- Uses Next.js 15 with App Router
- Tailwind v4 for styling
- No builder fee, no agent key signing (read-only example)
