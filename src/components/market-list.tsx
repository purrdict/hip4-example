"use client";

import { useMarkets } from "@/hooks/use-markets";
import type { Market, QuestionGroup } from "@/types/market";
import {
  parseRecurringDescription,
  parseExpiryDate,
  formatCountdown,
} from "@/types/market";
import { useState, useEffect } from "react";

// ─── Helpers ──────────────────────────────────────────────────────

const UNDERLYING_NAMES: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  HYPE: "Hyperliquid",
  XRP: "XRP",
  DOGE: "Dogecoin",
  AVAX: "Avalanche",
  LINK: "Chainlink",
};

function formatRecurringTitle(underlying: string, expiry: string, period: string): string {
  const name = UNDERLYING_NAMES[underlying] ?? underlying;
  if (period !== "1d" && period !== "1w") {
    const short: Record<string, string> = {
      "1h": "Hourly", "4h": "4H", "30m": "30 Min", "15m": "15 Min", "5m": "5 Min",
    };
    return `${name} ${short[period] ?? period} Up or Down?`;
  }
  const date = parseExpiryDate(expiry);
  if (!date) return `${name} Up or Down?`;
  const month = date.toLocaleDateString("en-US", { month: "long" });
  const day = date.getDate();
  return `${name} Up or Down by ${month} ${day}?`;
}

// ─── Coin logo ────────────────────────────────────────────────────

function CoinLogo({ symbol, size = 32 }: { symbol: string; size?: number }) {
  const [err, setErr] = useState(false);
  const url = `https://app.hyperliquid.xyz/coins/${symbol}.svg`;

  if (err) {
    return (
      <div
        className="rounded-full flex items-center justify-center font-bold shrink-0"
        style={{
          width: size,
          height: size,
          background: "var(--muted)",
          color: "var(--muted-foreground)",
          fontSize: size * 0.3,
          fontFamily: "Space Grotesk, system-ui, sans-serif",
        }}
      >
        {symbol.slice(0, 2)}
      </div>
    );
  }

  return (
    <div
      className="rounded-full overflow-hidden shrink-0"
      style={{
        width: size,
        height: size,
        background: "var(--muted)",
        border: "1px solid var(--border)",
      }}
    >
      <img
        src={url}
        alt={symbol}
        width={size}
        height={size}
        onError={() => setErr(true)}
        style={{ objectFit: "cover", width: "100%", height: "100%" }}
      />
    </div>
  );
}

// ─── Countdown hook ────────────────────────────────────────────────

function useCountdown(expiryDate: Date | null): string {
  const [countdown, setCountdown] = useState(() =>
    expiryDate ? formatCountdown(expiryDate) : "—"
  );
  useEffect(() => {
    if (!expiryDate) return;
    setCountdown(formatCountdown(expiryDate));
    const id = setInterval(() => setCountdown(formatCountdown(expiryDate)), 1000);
    return () => clearInterval(id);
  }, [expiryDate]);
  return countdown;
}

// ─── Card shell ────────────────────────────────────────────────────

function CardShell({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      className="rounded-2xl border cursor-pointer flex flex-col transition-all duration-150 overflow-hidden"
      style={{
        background: "var(--card)",
        borderColor: selected ? "oklch(0.93 0.26 128 / 0.5)" : "var(--border)",
        boxShadow: selected ? "0 0 0 1px oklch(0.93 0.26 128 / 0.15)" : "none",
      }}
      onMouseOver={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLElement).style.borderColor = "oklch(0.30 0.008 50)";
        }
      }}
      onMouseOut={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
        }
      }}
    >
      {children}
    </div>
  );
}

// ─── Live dot ─────────────────────────────────────────────────────

function LiveDot() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
      </span>
      <span className="text-[11px] font-bold uppercase tracking-wider text-red-500">
        Live
      </span>
    </div>
  );
}

// ─── Recurring market card ─────────────────────────────────────────

function RecurringMarketCard({
  market,
  perpMid,
  selected,
  onClick,
}: {
  market: Market;
  perpMid: number | null;
  selected: boolean;
  onClick: () => void;
}) {
  const meta = parseRecurringDescription(market.description);
  if (!meta) return null;

  const expiryDate = parseExpiryDate(meta.expiry);
  const countdown = useCountdown(expiryDate);

  const yesSide = market.sides[0];
  const yesMid = yesSide?.midPrice;
  const yesPct = yesMid !== null && yesMid !== undefined ? yesMid * 100 : null;

  const title = formatRecurringTitle(meta.underlying, meta.expiry, meta.period);
  const isExpired = expiryDate ? expiryDate.getTime() < Date.now() : false;

  return (
    <CardShell selected={selected} onClick={onClick}>
      {/* Logo + title + pct */}
      <div className="px-4 pt-4 pb-3 flex items-start gap-3">
        <CoinLogo symbol={meta.underlying} size={36} />
        <div className="flex-1 min-w-0">
          <h3
            className="font-display font-semibold text-[14px] leading-snug"
            style={{ color: "var(--foreground)" }}
          >
            {title}
          </h3>
          {perpMid !== null && (
            <p className="text-[11px] mt-0.5 font-mono tabular-nums" style={{ color: "var(--muted-foreground)" }}>
              {meta.underlying} ${perpMid.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          )}
        </div>
        {yesPct !== null && !isExpired && (
          <span
            className="text-lg font-bold tabular-nums shrink-0"
            style={{
              color:
                Math.abs(yesPct - 50) < 1
                  ? "var(--muted-foreground)"
                  : yesPct > 50
                  ? "var(--success)"
                  : "var(--destructive)",
            }}
          >
            {Math.round(yesPct > 50 ? yesPct : 100 - yesPct)}%
          </span>
        )}
      </div>

      {/* Up/Down buttons */}
      {!isExpired && (
        <div className="px-4 pb-3">
          <div className="flex gap-2">
            <div
              className="flex-1 text-center rounded-xl py-2.5 text-sm font-semibold"
              style={{ background: "oklch(0.93 0.26 128 / 0.12)", color: "var(--success)" }}
            >
              Up
            </div>
            <div
              className="flex-1 text-center rounded-xl py-2.5 text-sm font-semibold"
              style={{ background: "oklch(0.62 0.22 25 / 0.12)", color: "var(--destructive)" }}
            >
              Down
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 pb-4 flex items-center justify-between">
        {isExpired ? (
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--muted-foreground)" }} />
            <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>Settling…</span>
          </div>
        ) : (
          <LiveDot />
        )}
        <div className="text-[11px] font-mono tabular-nums" style={{ color: "oklch(0.78 0.12 70)" }}>
          {countdown}
        </div>
      </div>
    </CardShell>
  );
}

// ─── Outcome row (inside QuestionCard) ────────────────────────────

function OutcomeRow({
  market,
  onClick,
}: {
  market: Market;
  onClick: () => void;
}) {
  const yesSide = market.sides[0];
  const yesMid = yesSide?.midPrice;
  const pct = yesMid !== null && yesMid !== undefined ? yesMid * 100 : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onClick(); } }}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors cursor-pointer"
      onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.background = "oklch(0.15 0.007 50)")}
      onMouseOut={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
    >
      <span
        className="flex-1 text-sm font-medium truncate"
        style={{ color: "var(--foreground)" }}
      >
        {market.name}
      </span>
      {pct !== null ? (
        <div className="flex items-center gap-2.5 shrink-0">
          <div
            className="w-14 h-1.5 rounded-full overflow-hidden"
            style={{ background: "var(--muted)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background: pct >= 50 ? "var(--success)" : "var(--destructive)",
                opacity: 0.7,
              }}
            />
          </div>
          <span
            className="text-sm font-bold tabular-nums w-10 text-right font-mono"
            style={{ color: pct >= 50 ? "var(--success)" : "var(--destructive)" }}
          >
            {pct.toFixed(0)}%
          </span>
        </div>
      ) : (
        <span className="text-sm tabular-nums w-10 text-right" style={{ color: "var(--muted-foreground)" }}>
          —
        </span>
      )}
    </div>
  );
}

// ─── Question card (multi-outcome group) ──────────────────────────

function QuestionCard({
  group,
  selected,
  onSelect,
}: {
  group: QuestionGroup;
  selected: boolean;
  onSelect: (market: Market) => void;
}) {
  // Sort by probability descending — highest probability first
  const sorted = [...group.outcomes].sort((a, b) => {
    const pa = a.sides[0]?.midPrice ?? 0;
    const pb = b.sides[0]?.midPrice ?? 0;
    return pb - pa;
  });
  const moreCount = Math.max(0, sorted.length - 3);
  const visible = sorted.slice(0, 3);

  return (
    <CardShell selected={selected} onClick={() => onSelect(sorted[0])}>
      {/* Title */}
      <div className="px-5 pt-5 pb-2">
        <h3
          className="font-display font-semibold text-[14px] leading-snug"
          style={{ color: "var(--foreground)" }}
        >
          {group.questionName}
        </h3>
      </div>

      {/* Outcomes */}
      <div className="px-1.5 pb-2">
        {visible.map((m) => (
          <OutcomeRow
            key={m.outcomeId}
            market={m}
            onClick={() => onSelect(m)}
          />
        ))}
      </div>

      {/* Footer count */}
      <div
        className="px-5 pb-4 pt-1 mt-auto text-xs"
        style={{ color: "var(--muted-foreground)" }}
      >
        {group.outcomes.length} outcomes
        {moreCount > 0 && <span style={{ color: "oklch(0.50 0.007 70)" }}> · +{moreCount} more</span>}
      </div>
    </CardShell>
  );
}

// ─── Named binary card ─────────────────────────────────────────────

function NamedBinaryCard({
  market,
  selected,
  onClick,
}: {
  market: Market;
  selected: boolean;
  onClick: () => void;
}) {
  const sideA = market.sides[0];
  const sideB = market.sides[1];
  const pctA = sideA?.midPrice !== null && sideA?.midPrice !== undefined ? Math.round(sideA.midPrice * 100) : null;
  const pctB = sideB?.midPrice !== null && sideB?.midPrice !== undefined ? Math.round(sideB.midPrice * 100) : null;

  return (
    <CardShell selected={selected} onClick={onClick}>
      {/* Title */}
      <div className="px-5 pt-5 pb-3">
        <h3
          className="font-display font-semibold text-[14px] leading-snug"
          style={{ color: "var(--foreground)" }}
        >
          {market.questionName ?? market.name}
        </h3>
      </div>

      {/* Side buttons */}
      <div className="px-5 pb-5 mt-auto">
        <div className="flex gap-2">
          <div
            className="flex-1 text-center rounded-xl py-2.5 text-sm font-semibold"
            style={{
              background: "oklch(0.93 0.26 128 / 0.12)",
              color: "var(--success)",
            }}
          >
            {sideA?.name} {pctA !== null ? `${pctA}%` : ""}
          </div>
          {sideB && (
            <div
              className="flex-1 text-center rounded-xl py-2.5 text-sm font-semibold"
              style={{
                background: "oklch(0.62 0.22 25 / 0.12)",
                color: "var(--destructive)",
              }}
            >
              {sideB.name} {pctB !== null ? `${pctB}%` : ""}
            </div>
          )}
        </div>
      </div>
    </CardShell>
  );
}

// ─── Generic market card ───────────────────────────────────────────

function MarketCard({
  market,
  selected,
  onClick,
}: {
  market: Market;
  selected: boolean;
  onClick: () => void;
}) {
  // All standalone binary markets (named or Yes/No) use the same card layout
  return <NamedBinaryCard market={market} selected={selected} onClick={onClick} />;
}

// ─── Skeleton ─────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="rounded-2xl border p-4 space-y-3"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full animate-pulse" style={{ background: "var(--muted)" }} />
        <div className="space-y-2 flex-1">
          <div className="h-3.5 rounded animate-pulse w-3/4" style={{ background: "var(--muted)" }} />
          <div className="h-3 rounded animate-pulse w-1/3" style={{ background: "var(--muted)" }} />
        </div>
        <div className="h-6 w-10 rounded animate-pulse" style={{ background: "var(--muted)" }} />
      </div>
      <div className="flex gap-2">
        <div className="flex-1 h-10 rounded-xl animate-pulse" style={{ background: "var(--muted)" }} />
        <div className="flex-1 h-10 rounded-xl animate-pulse" style={{ background: "var(--muted)" }} />
      </div>
    </div>
  );
}

// ─── Section header ────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <h2
      className="text-[11px] font-semibold uppercase tracking-widest px-0.5 mb-3 font-display"
      style={{ color: "var(--muted-foreground)" }}
    >
      {label}
    </h2>
  );
}

// ─── Main export ──────────────────────────────────────────────────

export function MarketList({
  selectedId,
  onSelect,
}: {
  selectedId: number | null;
  onSelect: (market: Market) => void;
}) {
  const { markets, questions, perpMids, status, error } = useMarkets();

  if (status === "idle" || status === "loading") {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        className="rounded-xl border p-4 text-sm"
        style={{
          background: "oklch(0.62 0.22 25 / 0.08)",
          borderColor: "oklch(0.62 0.22 25 / 0.25)",
          color: "var(--destructive)",
        }}
      >
        {error ?? "Failed to load markets."}
      </div>
    );
  }

  // IDs in question groups (don't render them individually)
  const questionOutcomeIds = new Set(
    questions.flatMap((q) => [
      ...q.outcomes.map((m) => m.outcomeId),
      ...(q.fallbackOutcomeId !== null ? [q.fallbackOutcomeId] : []),
    ])
  );

  const recurring = markets.filter((m) => m.type === "recurring");
  // Binary / standalone markets (not in any question group)
  const standalone = markets.filter(
    (m) => m.type !== "recurring" && !questionOutcomeIds.has(m.outcomeId)
  );

  const isEmpty = recurring.length === 0 && standalone.length === 0 && questions.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Recurring */}
      {recurring.length > 0 && (
        <section>
          <SectionHeader label="Recurring" />
          <div className="flex flex-col gap-2.5">
            {recurring.map((m) => {
              const meta = parseRecurringDescription(m.description);
              const perpMid = meta?.underlying ? (perpMids[meta.underlying] ?? null) : null;
              return (
                <RecurringMarketCard
                  key={m.outcomeId}
                  market={m}
                  perpMid={perpMid}
                  selected={selectedId === m.outcomeId}
                  onClick={() => onSelect(m)}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Events: question groups + standalone */}
      {(questions.length > 0 || standalone.length > 0) && (
        <section>
          <SectionHeader label="Events" />
          <div className="flex flex-col gap-2.5">
            {questions.map((q) => (
              <QuestionCard
                key={q.questionId}
                group={q}
                selected={q.outcomes.some((m) => m.outcomeId === selectedId)}
                onSelect={onSelect}
              />
            ))}
            {standalone.map((m) => (
              <MarketCard
                key={m.outcomeId}
                market={m}
                selected={selectedId === m.outcomeId}
                onClick={() => onSelect(m)}
              />
            ))}
          </div>
        </section>
      )}

      {isEmpty && (
        <div className="text-sm text-center py-10" style={{ color: "var(--muted-foreground)" }}>
          No active markets found.
        </div>
      )}
    </div>
  );
}
