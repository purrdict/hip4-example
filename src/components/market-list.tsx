"use client";

import { useMarkets } from "@/hooks/use-markets";
import type { Market } from "@/types/market";
import {
  parseRecurringDescription,
  parseExpiryDate,
  formatCountdown,
} from "@/types/market";

// Underlying → emoji mapping for recurring markets
const UNDERLYING_EMOJI: Record<string, string> = {
  BTC: "₿",
  ETH: "Ξ",
  SOL: "◎",
  HYPE: "⚡",
};

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
  const countdown = expiryDate ? formatCountdown(expiryDate) : "—";
  const emoji = UNDERLYING_EMOJI[meta.underlying] ?? "?";

  const yesSide = market.sides[0];
  const noSide = market.sides[1];
  const yesPrice = yesSide?.midPrice;
  const noPrice = noSide?.midPrice;

  const isAbove = meta.targetPrice > 0;

  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left rounded-xl border p-4 transition-all duration-150",
        selected
          ? "border-emerald-500/60 bg-emerald-500/8 shadow-lg shadow-emerald-500/10"
          : "border-slate-800 bg-slate-900 hover:border-slate-700 hover:bg-slate-800/80",
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{emoji}</span>
          <div>
            <div className="text-sm font-semibold text-slate-100">
              {meta.underlying} {isAbove ? "Up" : "Down"} — {meta.period.toUpperCase()}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Target: ${meta.targetPrice.toLocaleString()}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-slate-500">Expires</div>
          <div className="text-xs font-mono text-amber-400">{countdown}</div>
        </div>
      </div>

      {/* Live reference price */}
      {perpMid !== null && (
        <div className="mb-3 text-xs text-slate-500">
          {meta.underlying} live:{" "}
          <span className="text-slate-300 font-mono">${perpMid.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        </div>
      )}

      {/* Yes/No prices */}
      <div className="grid grid-cols-2 gap-2">
        {yesSide && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-center">
            <div className="text-[11px] text-emerald-400/70 mb-0.5">{yesSide.name}</div>
            <div className="text-sm font-mono font-semibold text-emerald-400">
              {yesPrice != null ? `${(yesPrice * 100).toFixed(1)}¢` : "—"}
            </div>
          </div>
        )}
        {noSide && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-center">
            <div className="text-[11px] text-red-400/70 mb-0.5">{noSide.name}</div>
            <div className="text-sm font-mono font-semibold text-red-400">
              {noPrice != null ? `${(noPrice * 100).toFixed(1)}¢` : "—"}
            </div>
          </div>
        )}
      </div>
    </button>
  );
}

function OtherMarketCard({
  market,
  selected,
  onClick,
}: {
  market: Market;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left rounded-xl border p-4 transition-all duration-150",
        selected
          ? "border-blue-500/60 bg-blue-500/8 shadow-lg shadow-blue-500/10"
          : "border-slate-800 bg-slate-900 hover:border-slate-700 hover:bg-slate-800/80",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="text-sm font-semibold text-slate-100 line-clamp-2">
          {market.questionName ?? market.name}
        </div>
        <span
          className={[
            "shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full",
            market.type === "binary"
              ? "bg-blue-500/15 text-blue-400"
              : "bg-purple-500/15 text-purple-400",
          ].join(" ")}
        >
          {market.type === "binary" ? "Binary" : "Multi"}
        </span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {market.sides.map((s) => (
          <div
            key={s.coin}
            className="text-xs rounded-lg bg-slate-800 border border-slate-700 px-2 py-1"
          >
            <span className="text-slate-400">{s.name}: </span>
            <span className="font-mono text-slate-200">
              {s.midPrice != null ? `${(s.midPrice * 100).toFixed(1)}¢` : "—"}
            </span>
          </div>
        ))}
      </div>
    </button>
  );
}

export function MarketList({
  selectedId,
  onSelect,
}: {
  selectedId: number | null;
  onSelect: (market: Market) => void;
}) {
  const { markets, perpMids, status, error } = useMarkets();

  if (status === "idle" || status === "loading") {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-32 rounded-xl bg-slate-900 border border-slate-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400">
        {error ?? "Failed to load markets."}
      </div>
    );
  }

  const recurring = markets.filter((m) => m.type === "recurring");
  const others = markets.filter((m) => m.type !== "recurring");

  return (
    <div className="flex flex-col gap-4">
      {recurring.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">
            Recurring
          </h3>
          <div className="flex flex-col gap-2">
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

      {others.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">
            Markets
          </h3>
          <div className="flex flex-col gap-2">
            {others.map((m) => (
              <OtherMarketCard
                key={m.outcomeId}
                market={m}
                selected={selectedId === m.outcomeId}
                onClick={() => onSelect(m)}
              />
            ))}
          </div>
        </section>
      )}

      {markets.length === 0 && (
        <div className="text-sm text-slate-500 text-center py-8">
          No active markets found.
        </div>
      )}
    </div>
  );
}
