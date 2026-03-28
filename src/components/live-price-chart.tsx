"use client";

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { Liveline } from "liveline";
import { fetchCandleSnapshot } from "@/lib/api";
import { subscribeMarkets, getMarketSnapshot } from "@/lib/market-store";
import { useSyncExternalStore } from "react";

// ─── Asset brand colors ───────────────────────────────────────────

const ASSET_COLORS: Record<string, string> = {
  BTC: "#f7931a",
  ETH: "#627eea",
  SOL: "#9945ff",
  HYPE: "#50e3c2",
};
const DEFAULT_COLOR = "#8b8b8b";

function getAssetColor(symbol: string): string {
  return ASSET_COLORS[symbol] ?? DEFAULT_COLOR;
}

// ─── Price formatting ─────────────────────────────────────────────

function formatChartPrice(price: number): string {
  if (price >= 1000)
    return `$${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (price >= 1)
    return `$${price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  return `$${price.toFixed(4)}`;
}

// ─── Seed history from candleSnapshot ────────────────────────────

async function seedHistory(
  symbol: string,
  minutes: number,
): Promise<{ time: number; value: number }[]> {
  const endTime = Date.now();
  const startTime = endTime - minutes * 60 * 1000;
  const staleCutoff = endTime - 5 * 60 * 1000;

  try {
    const candles = await fetchCandleSnapshot(symbol, "1m", startTime, endTime);
    if (!candles?.length) return [];

    const seen = new Set<number>();
    const points: { time: number; value: number }[] = [];
    for (const c of candles) {
      const timeSec = Math.floor(c.T / 1000);
      if (seen.has(timeSec)) continue;
      seen.add(timeSec);
      points.push({ time: timeSec, value: parseFloat(c.c) });
    }
    points.sort((a, b) => a.time - b.time);

    // If data is stale (last point > 5 min ago), skip
    if (
      points.length > 0 &&
      points[points.length - 1].time * 1000 < staleCutoff
    ) {
      return [];
    }

    return points.length >= 2 ? points : [];
  } catch {
    return [];
  }
}

// ─── Main component ───────────────────────────────────────────────

const MAX_POINTS = 3600;

type LivePriceChartProps = {
  symbol: string;
  targetPrice?: number;
  height?: number;
  historyMinutes?: number;
};

export function LivePriceChart({
  symbol,
  targetPrice,
  height = 220,
  historyMinutes = 60,
}: LivePriceChartProps) {
  // Single mutable array — never recreated. Liveline reads by iteration.
  const pointsRef = useRef<{ time: number; value: number }[]>([]);
  const latestPriceRef = useRef<number | null>(null);
  const seededRef = useRef(false);
  // Tick counter forces re-renders so Liveline picks up updates
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  const color = getAssetColor(symbol);

  // Read perp mid from market store
  const perpMid = useSyncExternalStore(
    subscribeMarkets,
    () => getMarketSnapshot().perpMids[symbol] ?? null,
    () => null,
  );

  if (perpMid !== null) {
    latestPriceRef.current = perpMid;
  }
  const currentValue = latestPriceRef.current ?? 0;

  // Append a data point — dedupes same-second updates by mutating in place
  const appendPoint = useCallback((time: number, value: number) => {
    const pts = pointsRef.current;
    const last = pts[pts.length - 1];
    if (last && time < last.time) return;
    if (last && time === last.time) {
      last.value = value;
      return;
    }
    if (pts.length >= MAX_POINTS) {
      pts.splice(0, pts.length - MAX_POINTS + 1);
    }
    pts.push({ time, value });
  }, []);

  // Push on price changes from store
  useEffect(() => {
    if (perpMid != null) {
      appendPoint(Math.floor(Date.now() / 1000), perpMid);
      bump();
    }
  }, [perpMid, appendPoint, bump]);

  // Keepalive — force a new point every second so time axis always advances
  useEffect(() => {
    const interval = setInterval(() => {
      const price = latestPriceRef.current;
      if (!price) return;
      const nowSec = Math.floor(Date.now() / 1000);
      const pts = pointsRef.current;
      const last = pts[pts.length - 1];
      if (last && nowSec <= last.time) return;
      if (pts.length >= MAX_POINTS) {
        pts.splice(0, pts.length - MAX_POINTS + 1);
      }
      pts.push({ time: nowSec, value: price });
      bump();
    }, 1000);
    return () => clearInterval(interval);
  }, [bump]);

  // Seed historical candle data
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;

    seedHistory(symbol, historyMinutes).then((history) => {
      if (!history.length) {
        // Fill synthetic flat history if no real data
        const price = latestPriceRef.current;
        if (price) {
          const nowSec = Math.floor(Date.now() / 1000);
          const startSec = nowSec - historyMinutes * 60;
          for (let t = startSec; t < nowSec; t += 30) {
            history.push({ time: t, value: price });
          }
        }
      }
      if (!history.length) return;

      const pts = pointsRef.current;
      const firstLiveTime = pts.length ? pts[0].time : Infinity;
      const historyOnly = history.filter((p) => p.time < firstLiveTime);
      pts.unshift(...historyOnly);
      bump();
    });
  }, [symbol, historyMinutes, bump]);

  const referenceLine = useMemo(
    () =>
      targetPrice ? { value: targetPrice, label: "Target" } : undefined,
    [targetPrice],
  );

  return (
    <div className="relative">
      {/* Asset badge */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2 py-1 rounded-md bg-card/80 backdrop-blur-sm">
        <img
          src={`https://app.hyperliquid.xyz/coins/${symbol}.svg`}
          alt={symbol}
          className="h-4 w-4 rounded-full"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <span className="text-[11px] font-medium text-muted-foreground">
          {symbol}
        </span>
      </div>

      {/* Target price badge */}
      {targetPrice !== undefined && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-card/80 backdrop-blur-sm">
          <span className="text-[10px] text-muted-foreground">Target</span>
          <span className="text-[11px] font-mono font-medium tabular-nums">
            {formatChartPrice(targetPrice)}
          </span>
        </div>
      )}

      <div style={{ height }}>
        <Liveline
          data={pointsRef.current}
          value={currentValue}
          color={color}
          theme="dark"
          grid
          fill
          pulse
          momentum
          scrub
          lineWidth={2}
          window={600}
          referenceLine={referenceLine}
          padding={{ top: 28, right: 64, bottom: 28, left: 8 }}
          formatValue={formatChartPrice}
          formatTime={(t: number) =>
            new Date(t * 1000).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            })
          }
        />
      </div>

      {/* Current price vs target indicator */}
      {targetPrice !== undefined && currentValue > 0 && (
        <div className="absolute bottom-8 left-2 z-10 flex items-center gap-1.5 px-2 py-1 rounded-md bg-card/80 backdrop-blur-sm">
          <span
            className="text-[12px] font-mono font-bold tabular-nums"
            style={{
              color:
                currentValue > targetPrice
                  ? "var(--success)"
                  : "var(--destructive)",
            }}
          >
            {formatChartPrice(currentValue)}
          </span>
          <span
            className="text-[10px] font-medium"
            style={{
              color:
                currentValue > targetPrice
                  ? "var(--success)"
                  : "var(--destructive)",
            }}
          >
            {currentValue > targetPrice ? "▲" : "▼"}
            {" "}
            {Math.abs(
              ((currentValue - targetPrice) / targetPrice) * 100,
            ).toFixed(1)}
            %
          </span>
        </div>
      )}
    </div>
  );
}
