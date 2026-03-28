/** Raw outcome from outcomeMeta endpoint */
export type OutcomeRaw = {
  outcome: number;
  name: string;
  description: string;
  sideSpecs: { name: string }[];
};

/** Raw question from outcomeMeta endpoint */
export type QuestionRaw = {
  question: number;
  name: string;
  description: string;
  fallbackOutcome: number;
  namedOutcomes: number[];
  settledNamedOutcomes: number[];
};

/** outcomeMeta response */
export type OutcomeMetaResponse = {
  outcomes: OutcomeRaw[];
  questions: QuestionRaw[];
};

/** Parsed side for a market */
export type MarketSide = {
  index: number;
  name: string;
  coin: string;       // "#90"
  tokenCoin: string;  // "+90"
  assetIndex: number; // 10090
  midPrice: number | null;
};

/** Parsed market */
export type Market = {
  outcomeId: number;
  name: string;
  description: string;
  sides: MarketSide[];
  questionId: number | null;
  questionName: string | null;
  type: "binary" | "multi-outcome" | "recurring";
};

/** A multi-outcome question group (e.g. "What will Hypurr eat?") */
export type QuestionGroup = {
  questionId: number;
  questionName: string;
  /** Named outcomes (tradeable) sorted by probability */
  outcomes: Market[];
  /** Fallback outcome ID (untradeable, hide from UI) */
  fallbackOutcomeId: number | null;
};

/** Recurring market parsed description */
export type RecurringMeta = {
  class: string;
  underlying: string;
  expiry: string;
  targetPrice: number;
  period: string;
};

/** Orderbook level */
export type BookLevel = {
  px: string;
  sz: string;
  n: number;
};

/** Orderbook snapshot */
export type L2Book = {
  coin: string;
  levels: [BookLevel[], BookLevel[]]; // [bids, asks]
  time: number;
};

// ─── Coin naming helpers ───────────────────────────────────────────────────

export function coinNumber(outcomeId: number, sideIndex: number): number {
  return outcomeId * 10 + sideIndex;
}

export function apiCoin(outcomeId: number, sideIndex: number): string {
  return `#${coinNumber(outcomeId, sideIndex)}`;
}

export function tokenCoin(outcomeId: number, sideIndex: number): string {
  return `+${coinNumber(outcomeId, sideIndex)}`;
}

export function assetIndex(outcomeId: number, sideIndex: number): number {
  return 10000 + coinNumber(outcomeId, sideIndex);
}

/**
 * Parse recurring market description.
 * Format: "class:priceBinary|underlying:BTC|expiry:YYYYMMDD-HHMM|targetPrice:NNNNN|period:15m|1d"
 */
export function parseRecurringDescription(desc: string): RecurringMeta | null {
  if (!desc.includes("class:")) return null;
  const parts = Object.fromEntries(
    desc.split("|").map((s) => {
      const [k, ...v] = s.split(":");
      return [k, v.join(":")];
    })
  );
  return {
    class: parts.class ?? "",
    underlying: parts.underlying ?? "",
    expiry: parts.expiry ?? "",
    targetPrice: Number(parts.targetPrice) || 0,
    period: parts.period ?? "",
  };
}

/** Parse expiry string "YYYYMMDD-HHMM" to Date */
export function parseExpiryDate(expiry: string): Date | null {
  if (!expiry) return null;
  const [datePart, timePart] = expiry.split("-");
  if (!datePart || datePart.length !== 8) return null;
  const year = datePart.slice(0, 4);
  const month = datePart.slice(4, 6);
  const day = datePart.slice(6, 8);
  const [hh, mm] = (timePart ?? "0000").match(/.{2}/g) ?? ["00", "00"];
  return new Date(`${year}-${month}-${day}T${hh}:${mm}:00Z`);
}

/** Format countdown to expiry */
export function formatCountdown(expiryDate: Date): string {
  const ms = expiryDate.getTime() - Date.now();
  if (ms <= 0) return "Settling...";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Hyperliquid price tick (5 significant figures) */
export function priceToTick(price: number): number {
  if (price <= 0) return 0.00001;
  const exp = Math.floor(Math.log10(price));
  return Math.pow(10, exp - 4);
}

/** Round price to tick, strip trailing zeros */
export function formatPrice(price: number): string {
  if (price <= 0) return "0.00001";
  const tick = priceToTick(price);
  const rounded = Math.round(price / tick) * tick;
  const exp = Math.floor(Math.log10(price));
  const decimals = Math.max(0, -(exp - 4));
  return rounded.toFixed(decimals).replace(/\.?0+$/, "");
}

/** Minimum shares for a given price (min order value ~10 USDH) */
export function getMinShares(midPrice: number | null): number {
  if (!midPrice || midPrice <= 0) return 20;
  return Math.ceil(10 / Math.max(midPrice, 0.01));
}

/** Legacy asset index for orders: a = 100000000 + coinNum */
export function orderAssetIndex(outcomeId: number, sideIndex: number): number {
  return 100000000 + coinNumber(outcomeId, sideIndex);
}
