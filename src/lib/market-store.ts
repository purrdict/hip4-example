/**
 * Market store — singleton external store for useSyncExternalStore.
 *
 * Pattern: NO useEffect for data. Data fetching is done here, outside React.
 * Components subscribe via useSyncExternalStore for tear-free rendering.
 */
import {
  fetchOutcomeMeta,
  fetchAllMids,
  type AllMidsResponse,
} from "./api";
import { wsClient } from "./ws-client";
import {
  apiCoin,
  tokenCoin,
  assetIndex,
  parseRecurringDescription,
  type Market,
  type MarketSide,
} from "@/types/market";

export type MarketStoreState = {
  markets: Market[];
  mids: Record<string, number>;
  perpMids: Record<string, number>;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
};

// ─── Internal state ────────────────────────────────────────────────────────

let state: MarketStoreState = {
  markets: [],
  mids: {},
  perpMids: {},
  status: "idle",
  error: null,
};

type Listener = () => void;
const listeners = new Set<Listener>();

function setState(patch: Partial<MarketStoreState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

// ─── Public API ────────────────────────────────────────────────────────────

export function subscribeMarkets(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMarketSnapshot(): MarketStoreState {
  return state;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** All perp symbols tracked (from recurring market underlyings) */
const perpSymbols = new Set<string>();

function buildMarketsFromMeta(
  meta: { outcomes: { outcome: number; name: string; description: string; sideSpecs: { name: string }[] }[]; questions: { question: number; name: string; description: string; fallbackOutcome: number; namedOutcomes: number[]; settledNamedOutcomes: number[] }[] },
  rawMids: AllMidsResponse
): { markets: Market[]; mids: Record<string, number>; perpMids: Record<string, number> } {
  const questionMap = new Map(meta.questions.map((q) => [q.question, q]));

  function findQuestion(outcomeId: number) {
    for (const q of questionMap.values()) {
      if ([...q.namedOutcomes, q.fallbackOutcome].includes(outcomeId)) return q;
    }
    return null;
  }

  function classifyType(name: string, outcomeId: number): Market["type"] {
    if (name === "Recurring") return "recurring";
    const q = findQuestion(outcomeId);
    if (q && q.namedOutcomes.length > 1) return "multi-outcome";
    return "binary";
  }

  const markets: Market[] = meta.outcomes.map((o) => {
    const q = findQuestion(o.outcome);
    const sides: MarketSide[] = o.sideSpecs.map((spec, i) => ({
      index: i,
      name: spec.name,
      coin: apiCoin(o.outcome, i),
      tokenCoin: tokenCoin(o.outcome, i),
      assetIndex: assetIndex(o.outcome, i),
      midPrice: rawMids[apiCoin(o.outcome, i)] ? parseFloat(rawMids[apiCoin(o.outcome, i)]) : null,
    }));

    return {
      outcomeId: o.outcome,
      name: o.name,
      description: o.description,
      sides,
      questionId: q?.question ?? null,
      questionName: q?.name ?? null,
      type: classifyType(o.name, o.outcome),
    };
  });

  // Collect perp symbols from recurring markets
  for (const m of markets) {
    if (m.type === "recurring") {
      const meta = parseRecurringDescription(m.description);
      if (meta?.underlying) perpSymbols.add(meta.underlying);
    }
  }

  const mids: Record<string, number> = {};
  const perpMids: Record<string, number> = {};
  for (const [k, v] of Object.entries(rawMids)) {
    if (k.startsWith("#")) {
      mids[k] = parseFloat(v);
    } else if (perpSymbols.has(k)) {
      perpMids[k] = parseFloat(v);
    }
  }

  return { markets, mids, perpMids };
}

// ─── Initialization ────────────────────────────────────────────────────────

let initPromise: Promise<void> | null = null;
let wsUnsub: (() => void) | null = null;

function startWsFeed() {
  if (wsUnsub) return;
  wsClient.connect();

  wsUnsub = wsClient.subscribe({ type: "allMids" }, (data: unknown) => {
    const update = data as { mids: Record<string, string> };
    const newMids = { ...state.mids };
    const newPerpMids = { ...state.perpMids };
    let changed = false;

    for (const [k, v] of Object.entries(update.mids)) {
      const num = parseFloat(v);
      if (k.startsWith("#")) {
        if (newMids[k] !== num) {
          newMids[k] = num;
          changed = true;
        }
      } else if (perpSymbols.has(k)) {
        if (newPerpMids[k] !== num) {
          newPerpMids[k] = num;
          changed = true;
        }
      }
    }

    if (changed) {
      // Also update market side mid prices
      const updatedMarkets = state.markets.map((m) => ({
        ...m,
        sides: m.sides.map((s) => ({
          ...s,
          midPrice: newMids[s.coin] ?? s.midPrice,
        })),
      }));
      setState({ mids: newMids, perpMids: newPerpMids, markets: updatedMarkets });
    }
  });
}

/**
 * Initialize the market store. Safe to call multiple times — only runs once.
 * Call this from a useEffect (lifecycle) or event handler, NOT during render.
 */
export function initMarkets(): Promise<void> {
  if (state.status !== "idle") return initPromise ?? Promise.resolve();

  setState({ status: "loading" });

  initPromise = (async () => {
    try {
      const [meta, rawMids] = await Promise.all([
        fetchOutcomeMeta(),
        fetchAllMids(),
      ]);

      const { markets, mids, perpMids } = buildMarketsFromMeta(meta, rawMids);
      setState({ markets, mids, perpMids, status: "ready" });
      startWsFeed();
    } catch (err) {
      setState({
        status: "error",
        error: err instanceof Error ? err.message : "Failed to load markets",
      });
    }
  })();

  return initPromise;
}
