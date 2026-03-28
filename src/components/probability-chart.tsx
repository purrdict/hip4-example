"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { fetchCandleSnapshot, type CandleSnap } from "@/lib/api";
import { wsClient } from "@/lib/ws-client";

// ─── Types ────────────────────────────────────────────────────────

type Interval = "15m" | "1h" | "4h" | "1d";

type ChartPoint = {
  time: number; // unix seconds
  value: number; // probability 0–1
};

// ─── Interval config ──────────────────────────────────────────────

const INTERVAL_CONFIG: Record<Interval, { label: string; lookback: number; candle: string }> = {
  "15m": { label: "15M", lookback: 6 * 60 * 60 * 1000,   candle: "15m" },
  "1h":  { label: "1H",  lookback: 24 * 60 * 60 * 1000,  candle: "1h"  },
  "4h":  { label: "4H",  lookback: 7 * 24 * 60 * 60 * 1000, candle: "4h" },
  "1d":  { label: "1D",  lookback: 30 * 24 * 60 * 60 * 1000, candle: "1d" },
};

// ─── SVG chart (no external lib needed) ──────────────────────────

type TooltipInfo = {
  x: number;
  y: number;
  value: number;
  time: number;
} | null;

function formatTime(ts: number, interval: Interval): string {
  const d = new Date(ts * 1000);
  if (interval === "1d") {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function SvgChart({
  data,
  liveValue,
  interval,
  width,
  height,
}: {
  data: ChartPoint[];
  liveValue: number | null;
  interval: Interval;
  width: number;
  height: number;
}) {
  const [tooltip, setTooltip] = useState<TooltipInfo>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (data.length < 2) return null;

  const PAD_L = 8;
  const PAD_R = 8;
  const PAD_T = 10;
  const PAD_B = 24;
  const W = width - PAD_L - PAD_R;
  const H = height - PAD_T - PAD_B;

  // Include live value in data for display
  const allData: ChartPoint[] = liveValue !== null
    ? [...data, { time: Math.floor(Date.now() / 1000), value: liveValue }]
    : data;

  const minT = allData[0].time;
  const maxT = allData[allData.length - 1].time;
  const tRange = maxT - minT || 1;

  const minV = 0;
  const maxV = 1;
  const vRange = maxV - minV;

  function xOf(t: number) {
    return PAD_L + ((t - minT) / tRange) * W;
  }
  function yOf(v: number) {
    return PAD_T + H - ((v - minV) / vRange) * H;
  }

  // Build polyline points
  const points = allData.map((p) => `${xOf(p.time)},${yOf(p.value)}`).join(" ");

  // Area path (closed polygon)
  const firstX = xOf(allData[0].time);
  const lastX = xOf(allData[allData.length - 1].time);
  const areaPoints = `${firstX},${yOf(0)} ${points} ${lastX},${yOf(0)}`;

  // Trend color
  const first = allData[0].value;
  const last = allData[allData.length - 1].value;
  const isUp = last >= first;
  const lineColor = isUp ? "oklch(0.93 0.26 128)" : "oklch(0.62 0.22 25)";
  const areaColor = isUp ? "oklch(0.93 0.26 128 / 0.12)" : "oklch(0.62 0.22 25 / 0.12)";
  const areaId = `area-grad-${isUp ? "up" : "down"}`;

  // 50% reference line
  const y50 = yOf(0.5);

  // X-axis ticks (4 labels)
  const tickCount = 4;
  const ticks: { t: number; x: number }[] = [];
  for (let i = 0; i <= tickCount; i++) {
    const t = minT + (i / tickCount) * tRange;
    ticks.push({ t, x: xOf(t) });
  }

  // Y-axis labels
  const yLabels = [0.25, 0.5, 0.75];

  // Mouse tracking for crosshair
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const relX = mx - PAD_L;
      const t = minT + (relX / W) * tRange;

      // Find nearest point
      let nearest = allData[0];
      let minDist = Infinity;
      for (const p of allData) {
        const d = Math.abs(p.time - t);
        if (d < minDist) { minDist = d; nearest = p; }
      }

      setTooltip({
        x: xOf(nearest.time),
        y: yOf(nearest.value),
        value: nearest.value,
        time: nearest.time,
      });
    },
    [allData, minT, tRange, W, PAD_L]
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  return (
    <div className="relative" style={{ width, height }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: "crosshair", userSelect: "none" }}
      >
        <defs>
          <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={isUp ? "oklch(0.93 0.26 128)" : "oklch(0.62 0.22 25)"}
              stopOpacity="0.2"
            />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 50% reference line */}
        <line
          x1={PAD_L}
          y1={y50}
          x2={PAD_L + W}
          y2={y50}
          stroke="oklch(0.28 0.007 70)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />

        {/* Y-axis labels */}
        {yLabels.map((v) => (
          <text
            key={v}
            x={PAD_L - 4}
            y={yOf(v) + 4}
            textAnchor="end"
            fontSize={9}
            fill="oklch(0.40 0.007 70)"
            fontFamily="JetBrains Mono, monospace"
          >
            {(v * 100).toFixed(0)}
          </text>
        ))}

        {/* Area fill */}
        <polygon
          points={areaPoints}
          fill={`url(#${areaId})`}
        />

        {/* Price line */}
        <polyline
          points={points}
          fill="none"
          stroke={lineColor}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Live dot */}
        {liveValue !== null && (
          <>
            <circle
              cx={xOf(allData[allData.length - 1].time)}
              cy={yOf(liveValue)}
              r={4}
              fill={lineColor}
              opacity={0.9}
            />
            <circle
              cx={xOf(allData[allData.length - 1].time)}
              cy={yOf(liveValue)}
              r={8}
              fill={lineColor}
              opacity={0.15}
            />
          </>
        )}

        {/* X-axis ticks */}
        <line
          x1={PAD_L}
          y1={PAD_T + H}
          x2={PAD_L + W}
          y2={PAD_T + H}
          stroke="oklch(0.22 0.008 50)"
          strokeWidth={1}
        />
        {ticks.map(({ t, x }, i) => (
          <text
            key={i}
            x={x}
            y={PAD_T + H + 14}
            textAnchor="middle"
            fontSize={9}
            fill="oklch(0.42 0.007 70)"
            fontFamily="JetBrains Mono, monospace"
          >
            {formatTime(t, interval)}
          </text>
        ))}

        {/* Crosshair */}
        {tooltip && (
          <>
            <line
              x1={tooltip.x}
              y1={PAD_T}
              x2={tooltip.x}
              y2={PAD_T + H}
              stroke="oklch(0.50 0.007 70)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <line
              x1={PAD_L}
              y1={tooltip.y}
              x2={PAD_L + W}
              y2={tooltip.y}
              stroke="oklch(0.50 0.007 70)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle
              cx={tooltip.x}
              cy={tooltip.y}
              r={4}
              fill={lineColor}
              stroke="oklch(0.12 0.007 50)"
              strokeWidth={2}
            />
          </>
        )}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums"
          style={{
            left: Math.min(tooltip.x + 10, width - 110),
            top: Math.max(tooltip.y - 30, PAD_T),
            background: "oklch(0.16 0.007 50)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            zIndex: 10,
          }}
        >
          <div
            className="font-semibold"
            style={{ color: isUp ? "var(--success)" : "var(--destructive)" }}
          >
            {(tooltip.value * 100).toFixed(2)}%
          </div>
          <div style={{ color: "var(--muted-foreground)" }}>
            {formatTime(tooltip.time, interval)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main chart component ─────────────────────────────────────────

export function ProbabilityChart({ coin, sideName }: { coin: string; sideName: string }) {
  const [interval, setInterval] = useState<Interval>("1h");
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveValue, setLiveValue] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    setWidth(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

  // Load candles
  useEffect(() => {
    setLoading(true);
    setData([]);

    const { lookback, candle } = INTERVAL_CONFIG[interval];
    const endTime = Date.now();
    const startTime = endTime - lookback;

    fetchCandleSnapshot(coin, candle, startTime, endTime)
      .then((candles: CandleSnap[]) => {
        if (!candles || candles.length === 0) {
          setData([]);
          setLoading(false);
          return;
        }
        const pts: ChartPoint[] = candles.map((c) => ({
          time: Math.floor(c.t / 1000),
          value: parseFloat(c.c), // close price = probability
        }));
        setData(pts);
        setLoading(false);
      })
      .catch(() => {
        setData([]);
        setLoading(false);
      });
  }, [coin, interval]);

  // Live WebSocket updates
  useEffect(() => {
    wsClient.connect();
    const unsub = wsClient.subscribe({ type: "allMids" }, (rawData: unknown) => {
      const update = rawData as { mids: Record<string, string> };
      const mid = update.mids[coin];
      if (mid !== undefined) {
        setLiveValue(parseFloat(mid));
      }
    });
    return unsub;
  }, [coin]);

  const chartHeight = 180;

  const firstVal = data[0]?.value;
  const lastVal = liveValue ?? data[data.length - 1]?.value;
  const isUp = lastVal !== undefined && firstVal !== undefined ? lastVal >= firstVal : true;
  const changeAbs = lastVal !== undefined && firstVal !== undefined ? lastVal - firstVal : null;
  const changePct = changeAbs !== null && firstVal ? (changeAbs / firstVal) * 100 : null;

  return (
    <div className="w-full" ref={containerRef}>
      {/* Chart header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-3">
          <span
            className="text-2xl font-mono font-bold tabular-nums"
            style={{ color: isUp ? "var(--success)" : "var(--destructive)" }}
          >
            {liveValue !== null
              ? `${(liveValue * 100).toFixed(2)}%`
              : data.length > 0
              ? `${((data[data.length - 1].value) * 100).toFixed(2)}%`
              : "—"}
          </span>
          {changePct !== null && (
            <span
              className="text-sm font-mono tabular-nums"
              style={{ color: isUp ? "var(--success)" : "var(--destructive)" }}
            >
              {changePct >= 0 ? "+" : ""}{changePct.toFixed(1)}%
            </span>
          )}
        </div>

        {/* Interval selector */}
        <div
          className="flex gap-1 p-1 rounded-lg"
          style={{ background: "var(--muted)" }}
        >
          {(Object.entries(INTERVAL_CONFIG) as [Interval, typeof INTERVAL_CONFIG[Interval]][]).map(([key, cfg]) => (
            <button
              key={key}
              type="button"
              onClick={() => setInterval(key)}
              className="px-2.5 py-1 text-[11px] rounded-md transition-all font-mono font-medium"
              style={{
                background: interval === key ? "var(--card)" : "transparent",
                color: interval === key ? "var(--foreground)" : "var(--muted-foreground)",
                boxShadow: interval === key ? "0 1px 3px rgba(0,0,0,0.3)" : "none",
              }}
            >
              {cfg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {loading ? (
        <div
          className="w-full rounded-lg animate-pulse"
          style={{ height: chartHeight, background: "var(--muted)" }}
        />
      ) : data.length === 0 ? (
        <div
          className="w-full rounded-lg flex items-center justify-center text-xs"
          style={{
            height: chartHeight,
            background: "var(--muted)",
            color: "var(--muted-foreground)",
          }}
        >
          No price history available
        </div>
      ) : width > 0 ? (
        <SvgChart
          data={data}
          liveValue={liveValue}
          interval={interval}
          width={width}
          height={chartHeight}
        />
      ) : null}

      {/* Side label */}
      <div
        className="mt-1.5 text-[10px] font-medium uppercase tracking-wider"
        style={{ color: "var(--muted-foreground)" }}
      >
        {sideName} probability
      </div>
    </div>
  );
}
