/**
 * Hyperliquid API client for HIP-4 testnet.
 * All requests go to the testnet endpoint.
 */

const API_URL = "https://api.hyperliquid-testnet.xyz";

export type AllMidsResponse = Record<string, string>;

export type OutcomeMetaResponse = {
  outcomes: {
    outcome: number;
    name: string;
    description: string;
    sideSpecs: { name: string }[];
  }[];
  questions: {
    question: number;
    name: string;
    description: string;
    fallbackOutcome: number;
    namedOutcomes: number[];
    settledNamedOutcomes: number[];
  }[];
};

export type L2BookLevel = {
  px: string;
  sz: string;
  n: number;
};

export type L2BookResponse = {
  coin: string;
  levels: [L2BookLevel[], L2BookLevel[]];
  time: number;
};

async function info<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_URL}/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Info request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export function fetchOutcomeMeta(): Promise<OutcomeMetaResponse> {
  return info({ type: "outcomeMeta" });
}

export function fetchAllMids(): Promise<AllMidsResponse> {
  return info({ type: "allMids" });
}

export function fetchL2Book(coin: string): Promise<L2BookResponse> {
  return info({ type: "l2Book", coin });
}

export type CandleSnap = {
  t: number;  // open time ms
  T: number;  // close time ms
  s: string;  // symbol
  i: string;  // interval
  o: string;  // open
  c: string;  // close
  h: string;  // high
  l: string;  // low
  v: string;  // volume
  n: number;  // num trades
};

export function fetchCandleSnapshot(
  coin: string,
  interval: string,
  startTime: number,
  endTime: number,
): Promise<CandleSnap[]> {
  return info({
    type: "candleSnapshot",
    req: { coin, interval, startTime, endTime },
  });
}
