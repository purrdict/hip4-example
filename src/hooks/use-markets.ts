"use client";
/**
 * useMarkets — subscribe to market store via useSyncExternalStore.
 *
 * NO useEffect for data. Data lives in the singleton store.
 * useEffect is only used here for lifecycle (start WS connection on mount).
 */
import { useSyncExternalStore, useEffect } from "react";
import {
  subscribeMarkets,
  getMarketSnapshot,
  initMarkets,
  type MarketStoreState,
} from "@/lib/market-store";

// Cached server snapshot — MUST be stable reference to avoid infinite loop
const SERVER_SNAPSHOT: MarketStoreState = {
  markets: [],
  questions: [],
  mids: {},
  perpMids: {},
  status: "idle" as const,
  error: null,
};

export function useMarkets(): MarketStoreState {
  const state = useSyncExternalStore(
    subscribeMarkets,
    getMarketSnapshot,
    () => SERVER_SNAPSHOT,
  );

  // Lifecycle only: kick off data loading once on mount
  useEffect(() => {
    initMarkets();
  }, []);

  return state;
}
