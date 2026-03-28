"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useCallback } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Market } from "@/types/market";
import {
  parseRecurringDescription,
  parseExpiryDate,
  formatCountdown,
  formatPrice,
  getMinShares,
  orderAssetIndex,
} from "@/types/market";
import { fetchL2Book, type L2BookLevel } from "@/lib/api";
import { wsClient } from "@/lib/ws-client";
import { ProbabilityChart } from "./probability-chart";
import { LivePriceChart } from "./live-price-chart";

// ─── Orderbook external store ─────────────────────────────────────

type BookEntry = { bids: L2BookLevel[]; asks: L2BookLevel[]; loaded: boolean };
const bookCache = new Map<string, BookEntry>();
const bookListeners = new Map<string, Set<() => void>>();

function notifyBook(coin: string) {
  bookListeners.get(coin)?.forEach((l) => l());
}

function subscribeBook(coin: string, listener: () => void): () => void {
  if (!bookListeners.has(coin)) bookListeners.set(coin, new Set());
  bookListeners.get(coin)!.add(listener);
  return () => bookListeners.get(coin)?.delete(listener);
}

// Stable server snapshots — one per coin, created lazily, always the same object
const serverSnapshots = new Map<string, BookEntry>();
function getServerSnapshot(coin: string): BookEntry {
  if (!serverSnapshots.has(coin)) {
    serverSnapshots.set(coin, { bids: [], asks: [], loaded: false });
  }
  return serverSnapshots.get(coin)!;
}

function getBookSnapshot(coin: string): BookEntry {
  return bookCache.get(coin) ?? getServerSnapshot(coin);
}

const activeCoinSubs = new Map<string, () => void>();

function ensureBookSub(coin: string) {
  if (activeCoinSubs.has(coin)) return;
  activeCoinSubs.set(coin, () => {});

  fetchL2Book(coin)
    .then((snap) => {
      bookCache.set(coin, { bids: snap.levels[0], asks: snap.levels[1], loaded: true });
      notifyBook(coin);
    })
    .catch(() => {
      bookCache.set(coin, { bids: [], asks: [], loaded: true });
      notifyBook(coin);
    });

  wsClient.connect();
  const unsub = wsClient.subscribe({ type: "l2Book", coin }, (data: unknown) => {
    const update = data as { levels: [L2BookLevel[], L2BookLevel[]] };
    bookCache.set(coin, { bids: update.levels[0], asks: update.levels[1], loaded: true });
    notifyBook(coin);
  });
  activeCoinSubs.set(coin, unsub);
}

// ─── Helpers ──────────────────────────────────────────────────────

function fmtCents(price: number): string {
  const c = price * 100;
  if (c < 0.01) return `${(c * 10).toFixed(2)}m¢`;
  if (c < 1) return `${c.toFixed(2)}¢`;
  return `${c.toFixed(1)}¢`;
}

function fmtSize(sz: number): string {
  if (sz >= 1_000_000) return `${(sz / 1_000_000).toFixed(1)}M`;
  if (sz >= 1_000) return `${(sz / 1_000).toFixed(1)}K`;
  return sz.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// ─── Orderbook display ────────────────────────────────────────────

const BOOK_ROWS = 8;

function BookSide({
  levels,
  side,
}: {
  levels: L2BookLevel[];
  side: "bid" | "ask";
}) {
  const rows = levels.slice(0, BOOK_ROWS);
  const maxSz = rows.reduce((m, l) => Math.max(m, parseFloat(l.sz)), 0.001);
  const isBid = side === "bid";

  return (
    <div className="flex flex-col gap-px">
      {rows.map((level, i) => {
        const px = parseFloat(level.px);
        const sz = parseFloat(level.sz);
        const pct = (sz / maxSz) * 100;
        return (
          <div
            key={i}
            className="relative flex items-center justify-between px-2 py-[3px] rounded text-[12px]"
          >
            {/* Depth bar */}
            <div
              className="absolute inset-y-0 rounded"
              style={{
                width: `${pct}%`,
                background: isBid
                  ? "oklch(0.93 0.26 128 / 0.12)"
                  : "oklch(0.62 0.22 25 / 0.12)",
                [isBid ? "right" : "left"]: 0,
              }}
            />
            <span
              className="font-mono tabular-nums relative z-10"
              style={{ color: isBid ? "var(--success)" : "var(--destructive)" }}
            >
              {fmtCents(px)}
            </span>
            <span
              className="font-mono tabular-nums relative z-10"
              style={{ color: "var(--muted-foreground)" }}
            >
              {fmtSize(sz)}
            </span>
          </div>
        );
      })}
      {rows.length === 0 && (
        <div
          className="text-[11px] text-center py-4"
          style={{ color: "var(--muted-foreground)" }}
        >
          No {isBid ? "bids" : "asks"}
        </div>
      )}
    </div>
  );
}

function Orderbook({ coin }: { coin: string }) {
  useEffect(() => {
    ensureBookSub(coin);
  }, [coin]);

  const book = useSyncExternalStore(
    (cb) => subscribeBook(coin, cb),
    () => getBookSnapshot(coin),
    () => getServerSnapshot(coin),
  );

  if (!book.loaded) {
    return (
      <div className="space-y-px">
        {[...Array(BOOK_ROWS * 2 + 1)].map((_, i) => (
          <div
            key={i}
            className="h-[22px] rounded animate-pulse"
            style={{
              background: "var(--muted)",
              opacity: 1 - i * 0.04,
            }}
          />
        ))}
      </div>
    );
  }

  const bestBid = book.bids[0] ? parseFloat(book.bids[0].px) : null;
  const bestAsk = book.asks[0] ? parseFloat(book.asks[0].px) : null;
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
  const mid = spread !== null && bestBid !== null ? bestBid + spread / 2 : null;

  return (
    <div>
      {/* Column headers */}
      <div
        className="grid grid-cols-2 px-2 mb-1 text-[10px] font-medium uppercase tracking-wider"
        style={{ color: "var(--muted-foreground)" }}
      >
        <span>Price</span>
        <span className="text-right">Size</span>
      </div>

      {/* Asks (highest to lowest, reversed) */}
      <BookSide levels={[...book.asks].reverse()} side="ask" />

      {/* Spread bar */}
      <div
        className="flex items-center gap-2 my-1.5 px-2"
        style={{ color: "var(--muted-foreground)" }}
      >
        <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
        <span className="text-[10px] font-mono tabular-nums">
          {spread !== null
            ? `${fmtCents(spread)} spread · Mid ${mid !== null ? fmtCents(mid) : "—"}`
            : "No spread"}
        </span>
        <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
      </div>

      {/* Bids */}
      <BookSide levels={book.bids} side="bid" />
    </div>
  );
}

// ─── Trade form ───────────────────────────────────────────────────

type TradeStatus = "idle" | "signing" | "submitting" | "success" | "error";
type OrderMode = "market" | "limit";
type Direction = "buy" | "sell";

function fmtUsd(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${n.toFixed(2)}`;
}

function TradeForm({
  market,
  sideIndex,
  direction,
  book,
}: {
  market: Market;
  sideIndex: 0 | 1;
  direction: Direction;
  book: BookEntry;
}) {
  const side = market.sides[sideIndex];
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [qty, setQty] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [mode, setMode] = useState<OrderMode>("market");
  const [status, setStatus] = useState<TradeStatus>("idle");
  const [result, setResult] = useState<string | null>(null);
  const [agentKey, setAgentKey] = useState<`0x${string}` | null>(null);
  const [agentAddr, setAgentAddr] = useState<string | null>(null);

  const isBuy = direction === "buy";
  const midPrice = side?.midPrice ?? null;
  const minShares = getMinShares(midPrice);
  const bestBid = book.bids[0] ? parseFloat(book.bids[0].px) : null;
  const bestAsk = book.asks[0] ? parseFloat(book.asks[0].px) : null;

  // Effective price for market orders
  const effectivePrice =
    mode === "limit"
      ? parseFloat(limitPrice) || 0
      : isBuy
      ? bestAsk ?? (midPrice ? Math.min(midPrice * 1.05, 0.99) : 0)
      : bestBid ?? (midPrice ? Math.max(midPrice * 0.95, 0.01) : 0);

  const sharesNum = parseInt(qty, 10) || 0;
  const cost = sharesNum * effectivePrice;

  // Reset qty on side/direction change (state adjustment during render — no useEffect needed)
  const prevKey = `${sideIndex}:${direction}`;
  const prevKeyRef = useRef(prevKey);
  if (prevKeyRef.current !== prevKey) {
    prevKeyRef.current = prevKey;
    setQty("");
  }

  // Agent key setup (lifecycle only)
  useEffect(() => {
    if (!address) return;
    const stored = sessionStorage.getItem(`hip4ex_agent_${address}`);
    if (stored) {
      try {
        const { key, addr } = JSON.parse(stored) as { key: `0x${string}`; addr: string };
        setAgentKey(key);
        setAgentAddr(addr);
        return;
      } catch {}
    }
    const key = generatePrivateKey();
    const account = privateKeyToAccount(key);
    sessionStorage.setItem(
      `hip4ex_agent_${address}`,
      JSON.stringify({ key, addr: account.address })
    );
    setAgentKey(key);
    setAgentAddr(account.address);
  }, [address]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!address || !side) return;

      if (!agentKey) {
        setResult("No agent key. Connect wallet and refresh.");
        setStatus("error");
        return;
      }

      const qtyNum = parseInt(qty, 10);
      if (isNaN(qtyNum) || qtyNum < minShares) {
        setResult(`Minimum ${minShares} shares`);
        setStatus("error");
        return;
      }

      if (mode === "limit") {
        const px = parseFloat(limitPrice);
        if (isNaN(px) || px <= 0 || px >= 1) {
          setResult("Limit price must be between 0¢ and 100¢");
          setStatus("error");
          return;
        }
      }

      setStatus("signing");
      setResult(null);

      try {
        const { signL1Action } = await import("@nktkas/hyperliquid/signing");
        const { privateKeyToAccount: pk2Acct } = await import("viem/accounts");
        const agent = pk2Acct(agentKey);

        let orderPrice: string;
        let tif: string;

        if (mode === "market") {
          // Wide tolerance for FrontendMarket — prevents "could not match" on thin books
          const rawSlippage = isBuy
            ? Math.min((bestAsk ?? midPrice ?? 0.5) * 1.30, 0.99)
            : Math.max((bestBid ?? midPrice ?? 0.5) * 0.70, 0.01);
          orderPrice = formatPrice(rawSlippage);
          tif = "FrontendMarket";
        } else {
          orderPrice = formatPrice(parseFloat(limitPrice));
          tif = "Gtc";
        }

        const a = orderAssetIndex(market.outcomeId, sideIndex);
        const action = {
          type: "order",
          orders: [
            {
              a,
              b: isBuy,
              p: orderPrice,
              s: qtyNum.toString(),
              r: false,
              t: { limit: { tif } },
            },
          ],
          grouping: "na",
        };

        const nonce = Date.now();
        const sig = await signL1Action({
          wallet: agent,
          action,
          nonce,
          isTestnet: true,
        });

        setStatus("submitting");

        const res = await fetch("https://api.hyperliquid-testnet.xyz/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, nonce, signature: sig }),
        });

        const data = await res.json() as {
          status: string;
          response?: { data?: { statuses?: Array<string | { error: string }> } };
        };

        if (data.status === "ok") {
          const statuses = data.response?.data?.statuses ?? [];
          const first = statuses[0];
          if (typeof first === "object" && first && "error" in first) {
            setResult(`Order rejected: ${first.error}`);
            setStatus("error");
          } else {
            setResult(`Order placed! ${typeof first === "string" ? first : JSON.stringify(first)}`);
            setStatus("success");
            setQty("");
          }
        } else {
          setResult(`Failed: ${JSON.stringify(data)}`);
          setStatus("error");
        }
      } catch (err) {
        setResult(err instanceof Error ? err.message : "Unknown error");
        setStatus("error");
      }
    },
    [address, side, agentKey, qty, limitPrice, mode, isBuy, market, sideIndex, midPrice, minShares, bestBid, bestAsk]
  );

  const isSubmitting = status === "signing" || status === "submitting";
  const canSubmit = !isSubmitting && !!qty && sharesNum >= minShares && address && agentKey;

  // Validation message
  const validationMsg =
    sharesNum > 0 && sharesNum < minShares
      ? `Minimum ${minShares} shares`
      : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Mode tabs */}
      <div
        className="flex gap-1 p-1 rounded-lg"
        style={{ background: "var(--muted)" }}
      >
        {(["market", "limit"] as OrderMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className="flex-1 text-xs py-1.5 rounded-md transition-all font-medium capitalize"
            style={{
              background: mode === m ? "var(--card)" : "transparent",
              color: mode === m ? "var(--foreground)" : "var(--muted-foreground)",
              boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,0.3)" : "none",
            }}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Live price context */}
      {mode === "market" && (bestBid !== null || bestAsk !== null) && (
        <div
          className="flex items-center justify-between text-[11px] px-1"
          style={{ color: "var(--muted-foreground)" }}
        >
          <span>
            Bid{" "}
            <span className="font-mono tabular-nums" style={{ color: "var(--success)" }}>
              {bestBid !== null ? fmtCents(bestBid) : "—"}
            </span>
          </span>
          {midPrice !== null && (
            <span className="font-mono" style={{ color: "oklch(0.45 0.007 70)" }}>
              Mid {fmtCents(midPrice)}
            </span>
          )}
          <span>
            Ask{" "}
            <span className="font-mono tabular-nums" style={{ color: "var(--destructive)" }}>
              {bestAsk !== null ? fmtCents(bestAsk) : "—"}
            </span>
          </span>
        </div>
      )}

      {/* Limit price input */}
      {mode === "limit" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Limit price
            </span>
            <div className="flex gap-2.5">
              {bestBid !== null && (
                <button
                  type="button"
                  onClick={() => setLimitPrice(bestBid.toFixed(5).replace(/0+$/, "").replace(/\.$/, ""))}
                  className="text-[10px] transition-colors font-mono tabular-nums"
                  style={{ color: "oklch(0.93 0.26 128 / 0.6)" }}
                >
                  Bid {fmtCents(bestBid)}
                </button>
              )}
              {midPrice !== null && (
                <button
                  type="button"
                  onClick={() => setLimitPrice(midPrice.toFixed(5).replace(/0+$/, "").replace(/\.$/, ""))}
                  className="text-[10px] transition-colors font-mono tabular-nums"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Mid {fmtCents(midPrice)}
                </button>
              )}
              {bestAsk !== null && (
                <button
                  type="button"
                  onClick={() => setLimitPrice(bestAsk.toFixed(5).replace(/0+$/, "").replace(/\.$/, ""))}
                  className="text-[10px] transition-colors font-mono tabular-nums"
                  style={{ color: "oklch(0.62 0.22 25 / 0.7)" }}
                >
                  Ask {fmtCents(bestAsk)}
                </button>
              )}
            </div>
          </div>
          <input
            type="text"
            inputMode="decimal"
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            placeholder={midPrice ? midPrice.toFixed(3) : "0.50"}
            className="w-full rounded-xl px-4 py-3 text-right text-lg font-mono font-bold tabular-nums focus:outline-none transition-colors"
            style={{
              background: "var(--muted)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
            }}
          />
        </div>
      )}

      {/* Shares input */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            Shares
            <span className="ml-1 font-mono" style={{ color: "oklch(0.42 0.007 70)" }}>
              (min {minShares})
            </span>
          </span>
        </div>
        <input
          type="number"
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder={minShares.toString()}
          min={minShares}
          step={1}
          className="w-full bg-transparent text-right text-4xl font-mono font-bold tabular-nums focus:outline-none"
          style={{ color: "var(--foreground)", caretColor: "var(--primary)" }}
        />
        {/* Derived info */}
        {sharesNum > 0 && effectivePrice > 0 && (
          <div
            className="text-right text-xs font-mono tabular-nums"
            style={{ color: "var(--muted-foreground)" }}
          >
            {isBuy
              ? `Cost ~${fmtUsd(cost)}`
              : `Proceeds ~${fmtUsd(cost)}`}
          </div>
        )}
      </div>

      {/* Validation error */}
      {validationMsg && (
        <p className="text-xs" style={{ color: "var(--destructive)" }}>
          {validationMsg}
        </p>
      )}

      {/* Order summary */}
      {sharesNum >= minShares && effectivePrice > 0 && (
        <div
          className="rounded-xl p-3 space-y-1.5"
          style={{ background: "var(--muted)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-baseline justify-between">
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              {isBuy ? "Payout if wins" : "Est. proceeds"}
            </span>
            <span
              className="text-base font-display font-bold tabular-nums"
              style={{ color: isBuy ? "var(--success)" : "var(--destructive)" }}
            >
              {fmtUsd(isBuy ? sharesNum * 1.0 : cost)}
            </span>
          </div>
          <div
            className="flex items-center justify-between text-[11px] font-mono tabular-nums"
            style={{ color: "var(--muted-foreground)" }}
          >
            <span>{sharesNum} shares × {fmtCents(effectivePrice)}</span>
            <span style={{ color: "var(--foreground)" }}>
              {isBuy ? `Cost ${fmtUsd(cost)}` : ""}
            </span>
          </div>
        </div>
      )}

      {/* Agent notice */}
      {address && !agentKey && (
        <div
          className="rounded-lg px-3 py-2 text-xs"
          style={{
            background: "oklch(0.78 0.12 70 / 0.1)",
            border: "1px solid oklch(0.78 0.12 70 / 0.25)",
            color: "oklch(0.78 0.12 70)",
          }}
        >
          Generating agent key…
        </div>
      )}

      {/* Submit */}
      {!address ? (
        <div
          className="text-sm text-center py-3 rounded-xl"
          style={{
            background: "var(--muted)",
            color: "var(--muted-foreground)",
            border: "1px solid var(--border)",
          }}
        >
          Connect wallet to trade
        </div>
      ) : (
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all"
          style={{
            background: canSubmit
              ? isBuy
                ? "var(--success)"
                : "var(--destructive)"
              : "var(--muted)",
            color: canSubmit
              ? isBuy
                ? "var(--success-foreground)"
                : "var(--destructive-foreground)"
              : "var(--muted-foreground)",
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {isSubmitting
            ? status === "signing"
              ? "Signing…"
              : "Submitting…"
            : `${isBuy ? "Buy" : "Sell"} ${side?.name ?? ""}${
                sharesNum >= minShares ? ` · ${sharesNum} shares` : ""
              }`}
        </button>
      )}

      {/* Result */}
      {result && (
        <div
          className="rounded-xl px-3 py-2.5 text-xs leading-relaxed font-mono break-all"
          style={{
            background:
              status === "success"
                ? "oklch(0.93 0.26 128 / 0.1)"
                : "oklch(0.62 0.22 25 / 0.1)",
            border: `1px solid ${
              status === "success"
                ? "oklch(0.93 0.26 128 / 0.3)"
                : "oklch(0.62 0.22 25 / 0.3)"
            }`,
            color:
              status === "success" ? "var(--success)" : "var(--destructive)",
          }}
        >
          {result}
        </div>
      )}

      {/* Agent info */}
      {agentAddr && address && (
        <p
          className="text-[10px] font-mono break-all leading-relaxed"
          style={{ color: "oklch(0.35 0.007 70)" }}
        >
          Agent: {agentAddr}
        </p>
      )}
    </form>
  );
}

// ─── Market detail (main export) ──────────────────────────────────

export function MarketDetail({ market, siblings }: { market: Market; siblings?: Market[] }) {
  // For multi-outcome question markets, show outcome tabs using sibling markets.
  // selectedSide tracks Yes(0)/No(1) within the active outcome.
  // activeOutcomeId tracks which outcome is selected when siblings are provided.
  const [selectedSide, setSelectedSide] = useState<0 | 1>(0);
  const [direction, setDirection] = useState<Direction>("buy");
  const [activeOutcomeId, setActiveOutcomeId] = useState<number>(market.outcomeId);

  // Reset active outcome when the root market changes (e.g. switching question groups)
  const prevMarketRef = useRef(market.outcomeId);
  if (prevMarketRef.current !== market.outcomeId) {
    prevMarketRef.current = market.outcomeId;
    setActiveOutcomeId(market.outcomeId);
    setSelectedSide(0);
    setDirection("buy");
  }

  // Resolve the active market: for multi-outcome, find the sibling matching activeOutcomeId
  const isMultiOutcome = Boolean(siblings && siblings.length > 1);
  const activeMarket: Market =
    isMultiOutcome && siblings
      ? (siblings.find((s) => s.outcomeId === activeOutcomeId) ?? market)
      : market;

  const side = activeMarket.sides[selectedSide];
  const meta = market.type === "recurring" ? parseRecurringDescription(market.description) : null;
  const expiryDate = meta?.expiry ? parseExpiryDate(meta.expiry) : null;

  const [countdown, setCountdown] = useState(expiryDate ? formatCountdown(expiryDate) : null);
  useEffect(() => {
    if (!expiryDate) return;
    setCountdown(formatCountdown(expiryDate));
    const id = setInterval(() => setCountdown(formatCountdown(expiryDate)), 1000);
    return () => clearInterval(id);
  }, [expiryDate]);

  // Subscribe to orderbook for the active side
  useEffect(() => {
    if (side) ensureBookSub(side.coin);
  }, [side?.coin]);

  const book = useSyncExternalStore(
    (cb) => subscribeBook(side?.coin ?? "NONE", cb),
    () => getBookSnapshot(side?.coin ?? "NONE"),
    () => getServerSnapshot(side?.coin ?? "NONE"),
  );

  const periodLabel = meta
    ? meta.period === "15m"
      ? "15 Min"
      : meta.period === "1h"
      ? "1 Hour"
      : meta.period === "1d"
      ? "1 Day"
      : meta.period
    : null;

  return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
      {/* ── Market header ────────────────────────────────── */}
      <div
        className="shrink-0 px-5 py-4 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              className="text-base font-display font-semibold leading-tight"
              style={{ color: "var(--foreground)" }}
            >
              {market.questionName ?? market.name}
            </h2>
            {meta && (
              <div
                className="flex items-center gap-3 mt-1.5 text-[11px]"
                style={{ color: "var(--muted-foreground)" }}
              >
                <span className="font-mono">
                  Target{" "}
                  <span style={{ color: "var(--foreground)" }}>
                    ${meta.targetPrice.toLocaleString()}
                  </span>
                </span>
                {periodLabel && <span>{periodLabel}</span>}
              </div>
            )}
          </div>
          {countdown && (
            <div className="shrink-0 text-right">
              <div className="text-[10px] mb-0.5" style={{ color: "var(--muted-foreground)" }}>
                Expires
              </div>
              <div
                className="text-[12px] font-mono tabular-nums font-medium"
                style={{ color: "oklch(0.78 0.12 70)" }}
              >
                {countdown}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Side / Outcome tabs ────────────────────────── */}
      {isMultiOutcome && siblings ? (
        /* Multi-outcome: show outcome name tabs (e.g. Akami, Canned Tuna) */
        <div
          className="shrink-0 px-5 py-3 border-b flex gap-2 overflow-x-auto"
          style={{ borderColor: "var(--border)" }}
        >
          {siblings.map((sib) => {
            const isSelected = activeOutcomeId === sib.outcomeId;
            const yesMid = sib.sides[0]?.midPrice;
            return (
              <button
                key={sib.outcomeId}
                type="button"
                onClick={() => {
                  setActiveOutcomeId(sib.outcomeId);
                  setSelectedSide(0);
                }}
                className="shrink-0 rounded-xl py-2.5 px-3 text-sm font-semibold transition-all"
                style={{
                  background: isSelected
                    ? "oklch(0.93 0.26 128 / 0.15)"
                    : "var(--muted)",
                  color: isSelected ? "var(--success)" : "var(--muted-foreground)",
                  border: `1px solid ${
                    isSelected ? "oklch(0.93 0.26 128 / 0.3)" : "var(--border)"
                  }`,
                }}
              >
                {sib.name}
                {yesMid != null && (
                  <span className="ml-1.5 text-[11px] font-mono opacity-80 tabular-nums">
                    {(yesMid * 100).toFixed(1)}¢
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : activeMarket.sides.length > 1 ? (
        /* Binary / recurring: show Yes/No side tabs */
        <div
          className="shrink-0 px-5 py-3 border-b flex gap-2"
          style={{ borderColor: "var(--border)" }}
        >
          {activeMarket.sides.map((s, i) => {
            const isSelected = selectedSide === i;
            const isYes = i === 0;
            return (
              <button
                key={s.coin}
                type="button"
                onClick={() => setSelectedSide(i as 0 | 1)}
                className="flex-1 rounded-xl py-2.5 px-3 text-sm font-semibold transition-all"
                style={{
                  background: isSelected
                    ? isYes
                      ? "oklch(0.93 0.26 128 / 0.15)"
                      : "oklch(0.62 0.22 25 / 0.15)"
                    : "var(--muted)",
                  color: isSelected
                    ? isYes
                      ? "var(--success)"
                      : "var(--destructive)"
                    : "var(--muted-foreground)",
                  border: `1px solid ${
                    isSelected
                      ? isYes
                        ? "oklch(0.93 0.26 128 / 0.3)"
                        : "oklch(0.62 0.22 25 / 0.3)"
                      : "var(--border)"
                  }`,
                }}
              >
                {s.name}
                {s.midPrice != null && (
                  <span className="ml-1.5 text-[11px] font-mono opacity-80 tabular-nums">
                    {(s.midPrice * 100).toFixed(1)}¢
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* ── Chart ─────────────────────────────────────────── */}
      {side && (
        <div className="shrink-0 border-b" style={{ borderColor: "var(--border)" }}>
          {meta ? (
            /* Recurring: show underlying asset price with target line */
            <div className="overflow-hidden">
              <LivePriceChart
                key={meta.underlying}
                symbol={meta.underlying}
                targetPrice={meta.targetPrice}
                height={200}
                historyMinutes={60}
              />
            </div>
          ) : (
            /* Binary / multi-outcome: show outcome probability */
            <div className="px-5 py-4">
              <ProbabilityChart coin={side.coin} sideName={side.name} />
            </div>
          )}
        </div>
      )}

      {/* ── Orderbook ─────────────────────────────────────── */}
      {side && (
        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between mb-3">
            <h3
              className="text-[11px] font-semibold uppercase tracking-widest font-display"
              style={{ color: "var(--muted-foreground)" }}
            >
              Orderbook
            </h3>
            <span
              className="text-[10px] font-mono"
              style={{ color: "oklch(0.42 0.007 70)" }}
            >
              {side.name} · {side.coin}
            </span>
          </div>
          <Orderbook coin={side.coin} />
        </div>
      )}

      {/* ── Trade form ─────────────────────────────────────── */}
      <div className="shrink-0 px-5 py-4">
        {/* Buy / Sell toggle */}
        <div className="flex gap-4 border-b mb-4 pb-0" style={{ borderColor: "var(--border)" }}>
          {(["buy", "sell"] as Direction[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className="pb-2.5 text-sm font-semibold border-b-2 transition-colors capitalize"
              style={{
                borderColor:
                  direction === d
                    ? d === "buy"
                      ? "var(--success)"
                      : "var(--destructive)"
                    : "transparent",
                color:
                  direction === d
                    ? "var(--foreground)"
                    : "var(--muted-foreground)",
                marginBottom: "-1px",
              }}
            >
              {d}
            </button>
          ))}
        </div>

        <TradeForm
          market={activeMarket}
          sideIndex={selectedSide}
          direction={direction}
          book={book}
        />

        {/* Disclaimer */}
        <p
          className="text-[10px] leading-relaxed mt-4"
          style={{ color: "oklch(0.35 0.007 70)" }}
        >
          Testnet only. Agent key generated locally — must be approved on-chain via{" "}
          <code className="font-mono">approveAgent</code> before orders execute.
        </p>
      </div>
    </div>
  );
}

