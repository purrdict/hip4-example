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

export function useMarkets(): MarketStoreState {
  const state = useSyncExternalStore(
    subscribeMarkets,
    getMarketSnapshot,
    // Server snapshot — return idle state for SSR
    () => ({
      markets: [],
      mids: {},
      perpMids: {},
      status: "idle" as const,
      error: null,
    })
  );

  // Lifecycle only: kick off data loading once on mount
  useEffect(() => {
    initMarkets();
  }, []);

  return state;
}
