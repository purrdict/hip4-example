"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useCallback } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Market, BookLevel } from "@/types/market";
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

// ─── Orderbook store (per-coin, external) ────────────────────────────────

type BookEntry = { bids: L2BookLevel[]; asks: L2BookLevel[]; loaded: boolean };
const bookCache = new Map<string, BookEntry>();
const bookListeners = new Map<string, Set<() => void>>();

function notifyBookListeners(coin: string) {
  const set = bookListeners.get(coin);
  if (set) for (const l of set) l();
}

function subscribeBook(coin: string, listener: () => void): () => void {
  if (!bookListeners.has(coin)) bookListeners.set(coin, new Set());
  bookListeners.get(coin)!.add(listener);
  return () => bookListeners.get(coin)?.delete(listener);
}

function getBookSnapshot(coin: string): BookEntry {
  return bookCache.get(coin) ?? { bids: [], asks: [], loaded: false };
}

const activeCoinSubs = new Map<string, () => void>();

function ensureBookSub(coin: string) {
  if (activeCoinSubs.has(coin)) return;
  activeCoinSubs.set(coin, () => {});

  // Initial HTTP snapshot
  fetchL2Book(coin)
    .then((snap) => {
      bookCache.set(coin, { bids: snap.levels[0], asks: snap.levels[1], loaded: true });
      notifyBookListeners(coin);
    })
    .catch(() => {
      bookCache.set(coin, { bids: [], asks: [], loaded: true });
      notifyBookListeners(coin);
    });

  // Live WS updates
  wsClient.connect();
  const unsub = wsClient.subscribe({ type: "l2Book", coin }, (data: unknown) => {
    const update = data as { levels: [L2BookLevel[], L2BookLevel[]] };
    bookCache.set(coin, { bids: update.levels[0], asks: update.levels[1], loaded: true });
    notifyBookListeners(coin);
  });
  activeCoinSubs.set(coin, unsub);
}

// ─── Orderbook display ────────────────────────────────────────────────────

function BookSide({
  levels,
  side,
}: {
  levels: L2BookLevel[];
  side: "bid" | "ask";
}) {
  const top = levels.slice(0, 8);
  const maxSz = top.reduce((m, l) => Math.max(m, parseFloat(l.sz)), 0.001);

  return (
    <div className="flex flex-col gap-0.5">
      {top.map((level, i) => {
        const px = parseFloat(level.px);
        const sz = parseFloat(level.sz);
        const pct = (sz / maxSz) * 100;
        return (
          <div key={i} className="relative flex items-center justify-between text-[12px] font-mono px-2 py-0.5 rounded">
            {/* Background bar */}
            <div
              className={[
                "absolute inset-0 rounded opacity-15",
                side === "bid" ? "bg-emerald-500" : "bg-red-500",
              ].join(" ")}
              style={{
                width: `${pct}%`,
                [side === "bid" ? "right" : "left"]: 0,
                left: side === "ask" ? 0 : "auto",
                right: side === "bid" ? 0 : "auto",
              }}
            />
            <span className={side === "bid" ? "text-emerald-400 z-10 relative" : "text-red-400 z-10 relative"}>
              {(px * 100).toFixed(2)}¢
            </span>
            <span className="text-slate-400 z-10 relative">{sz.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
        );
      })}
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
    () => ({ bids: [], asks: [], loaded: false })
  );

  if (!book.loaded) {
    return (
      <div className="space-y-1">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-5 bg-slate-800 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  const spread =
    book.asks[0] && book.bids[0]
      ? parseFloat(book.asks[0].px) - parseFloat(book.bids[0].px)
      : null;

  return (
    <div>
      {/* Asks (reversed — highest at top) */}
      <BookSide levels={[...book.asks].reverse()} side="ask" />

      {/* Spread */}
      {spread !== null && (
        <div className="text-center text-[11px] text-slate-500 my-1">
          Spread: {(spread * 100).toFixed(3)}¢
        </div>
      )}

      {/* Bids */}
      <BookSide levels={book.bids} side="bid" />
    </div>
  );
}

// ─── Trade form ────────────────────────────────────────────────────────────

type TradeFormProps = {
  market: Market;
  sideIndex: 0 | 1;
  isBuy: boolean;
};

function TradeForm({ market, sideIndex, isBuy }: TradeFormProps) {
  const side = market.sides[sideIndex];
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [isLimit, setIsLimit] = useState(false);
  const [status, setStatus] = useState<"idle" | "signing" | "submitting" | "success" | "error">("idle");
  const [result, setResult] = useState<string | null>(null);
  const [agentKey, setAgentKey] = useState<`0x${string}` | null>(null);
  const [agentAddr, setAgentAddr] = useState<string | null>(null);
  const [needsAgent, setNeedsAgent] = useState(false);

  const minShares = getMinShares(side?.midPrice ?? null);
  const midPrice = side?.midPrice ?? null;

  // Generate a temporary agent key for this demo session (stored in sessionStorage)
  useEffect(() => {
    if (!address) return;
    const stored = sessionStorage.getItem(`hip4_agent_${address}`);
    if (stored) {
      try {
        const { key, addr } = JSON.parse(stored) as { key: `0x${string}`; addr: string };
        setAgentKey(key);
        setAgentAddr(addr);
        return;
      } catch {}
    }
    // Generate new demo agent key
    const key = generatePrivateKey();
    const account = privateKeyToAccount(key);
    sessionStorage.setItem(`hip4_agent_${address}`, JSON.stringify({ key, addr: account.address }));
    setAgentKey(key);
    setAgentAddr(account.address);
    setNeedsAgent(true);
  }, [address]);

  // Place order in event handler (NOT useEffect)
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!address || !walletClient || !side) return;

      const qtyNum = parseInt(qty, 10);
      if (isNaN(qtyNum) || qtyNum < minShares) {
        setResult(`Minimum order size: ${minShares} shares`);
        setStatus("error");
        return;
      }

      if (!agentKey) {
        setResult("No agent key. Please connect wallet and refresh.");
        setStatus("error");
        return;
      }

      setStatus("signing");
      setResult(null);

      try {
        // Import signing from @nktkas/hyperliquid
        const { signL1Action } = await import("@nktkas/hyperliquid/signing");
        const { privateKeyToAccount } = await import("viem/accounts");

        const agent = privateKeyToAccount(agentKey);

        // Use mid price for market orders, user price for limit
        const orderPrice = isLimit && price
          ? formatPrice(parseFloat(price))
          : formatPrice((midPrice ?? 0.5) * (isBuy ? 1.05 : 0.95));

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
              t: isLimit
                ? { limit: { tif: "Gtc" } }
                : { limit: { tif: "FrontendMarket" } },
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
          body: JSON.stringify({
            action,
            nonce,
            signature: sig,
          }),
        });

        const data = await res.json() as { status: string; response?: { data?: { statuses?: string[] } } };

        if (data.status === "ok") {
          const statuses = data.response?.data?.statuses ?? [];
          const firstStatus = statuses[0];
          if (typeof firstStatus === "object" && firstStatus && "error" in firstStatus) {
            setResult(`Order error: ${(firstStatus as { error: string }).error}`);
            setStatus("error");
          } else {
            setResult(`Order placed! Status: ${JSON.stringify(firstStatus)}`);
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
    [address, walletClient, side, qty, price, isLimit, agentKey, isBuy, market, sideIndex, midPrice, minShares]
  );

  if (!address) {
    return (
      <div className="text-sm text-slate-500 text-center py-4">
        Connect wallet to trade
      </div>
    );
  }

  if (!agentKey || needsAgent) {
    return (
      <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-400">
        <p className="font-medium mb-1">Agent Key Required</p>
        <p className="text-xs text-amber-400/70">
          This demo generates a local agent key for gas-less order signing. In production,
          use <code>approveAgent</code> to register it on-chain first.
        </p>
        <p className="text-xs text-amber-400/70 mt-1 font-mono break-all">
          Agent: {agentAddr}
        </p>
      </div>
    );
  }

  const sideLabel = side?.name ?? (sideIndex === 0 ? "Yes" : "No");
  const actionLabel = isBuy ? `Buy ${sideLabel}` : `Sell ${sideLabel}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Order type toggle */}
      <div className="flex gap-1 p-1 bg-slate-800 rounded-lg">
        <button
          type="button"
          onClick={() => setIsLimit(false)}
          className={[
            "flex-1 text-xs py-1.5 rounded-md transition-colors font-medium",
            !isLimit ? "bg-slate-600 text-slate-100" : "text-slate-400 hover:text-slate-300",
          ].join(" ")}
        >
          Market
        </button>
        <button
          type="button"
          onClick={() => setIsLimit(true)}
          className={[
            "flex-1 text-xs py-1.5 rounded-md transition-colors font-medium",
            isLimit ? "bg-slate-600 text-slate-100" : "text-slate-400 hover:text-slate-300",
          ].join(" ")}
        >
          Limit
        </button>
      </div>

      {/* Quantity */}
      <div>
        <label className="text-xs text-slate-400 mb-1 block">
          Shares <span className="text-slate-600">(min {minShares})</span>
        </label>
        <input
          type="number"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder={minShares.toString()}
          min={minShares}
          step={1}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-slate-500"
        />
      </div>

      {/* Price (limit only) */}
      {isLimit && (
        <div>
          <label className="text-xs text-slate-400 mb-1 block">
            Price (¢ per share)
          </label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={midPrice != null ? (midPrice * 100).toFixed(2) : "50"}
            min="0.01"
            max="99.99"
            step="0.01"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-slate-500"
          />
        </div>
      )}

      {/* Cost estimate */}
      {qty && midPrice != null && (
        <div className="text-xs text-slate-500">
          Est. cost:{" "}
          <span className="text-slate-300 font-mono">
            {(parseInt(qty || "0") * midPrice).toFixed(2)} USDH
          </span>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={status === "signing" || status === "submitting" || !qty}
        className={[
          "w-full py-2.5 rounded-lg text-sm font-semibold transition-colors",
          isBuy
            ? "bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-900 disabled:text-emerald-700 text-slate-950"
            : "bg-red-500 hover:bg-red-400 disabled:bg-red-900 disabled:text-red-700 text-slate-100",
        ].join(" ")}
      >
        {status === "signing"
          ? "Signing…"
          : status === "submitting"
          ? "Submitting…"
          : actionLabel}
      </button>

      {/* Result */}
      {result && (
        <div
          className={[
            "rounded-lg px-3 py-2 text-xs",
            status === "success"
              ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
              : "bg-red-500/10 border border-red-500/20 text-red-400",
          ].join(" ")}
        >
          {result}
        </div>
      )}
    </form>
  );
}

// ─── Market detail (main export) ─────────────────────────────────────────

export function MarketDetail({ market }: { market: Market }) {
  const [selectedSide, setSelectedSide] = useState<0 | 1>(0);
  const [isBuy, setIsBuy] = useState(true);
  const side = market.sides[selectedSide];

  const meta = market.type === "recurring" ? parseRecurringDescription(market.description) : null;
  const expiryDate = meta?.expiry ? parseExpiryDate(meta.expiry) : null;

  // Countdown timer — updates every second
  const [countdown, setCountdown] = useState(expiryDate ? formatCountdown(expiryDate) : null);
  useEffect(() => {
    if (!expiryDate) return;
    const id = setInterval(() => setCountdown(formatCountdown(expiryDate)), 1000);
    return () => clearInterval(id);
  }, [expiryDate]);

  return (
    <div className="flex flex-col gap-4">
      {/* Market header */}
      <div>
        <h2 className="text-base font-semibold text-slate-100 mb-1">
          {market.questionName ?? market.name}
        </h2>
        {meta && (
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>Target: <span className="text-slate-300">${meta.targetPrice.toLocaleString()}</span></span>
            {countdown && <span>Expires: <span className="text-amber-400 font-mono">{countdown}</span></span>}
          </div>
        )}
      </div>

      {/* Side tabs */}
      {market.sides.length > 1 && (
        <div className="flex gap-1 p-1 bg-slate-800 rounded-lg">
          {market.sides.map((s, i) => (
            <button
              key={s.coin}
              type="button"
              onClick={() => setSelectedSide(i as 0 | 1)}
              className={[
                "flex-1 text-xs py-2 rounded-md transition-colors font-medium",
                selectedSide === i ? "bg-slate-600 text-slate-100" : "text-slate-400 hover:text-slate-300",
              ].join(" ")}
            >
              {s.name}
              {s.midPrice != null && (
                <span className="ml-1 opacity-70">{(s.midPrice * 100).toFixed(1)}¢</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Orderbook */}
      {side && (
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Orderbook — {side.name} ({side.coin})
          </h3>
          <div className="grid grid-cols-2 text-[11px] text-slate-500 px-2 mb-1">
            <span>Price</span>
            <span className="text-right">Size</span>
          </div>
          <Orderbook coin={side.coin} />
        </div>
      )}

      {/* Trade form */}
      <div>
        <div className="flex gap-1 p-1 bg-slate-800 rounded-lg mb-3">
          <button
            type="button"
            onClick={() => setIsBuy(true)}
            className={[
              "flex-1 text-xs py-2 rounded-md transition-colors font-medium",
              isBuy ? "bg-emerald-600 text-slate-100" : "text-slate-400 hover:text-slate-300",
            ].join(" ")}
          >
            Buy
          </button>
          <button
            type="button"
            onClick={() => setIsBuy(false)}
            className={[
              "flex-1 text-xs py-2 rounded-md transition-colors font-medium",
              !isBuy ? "bg-red-600 text-slate-100" : "text-slate-400 hover:text-slate-300",
            ].join(" ")}
          >
            Sell
          </button>
        </div>
        <TradeForm market={market} sideIndex={selectedSide} isBuy={isBuy} />
      </div>

      {/* Disclaimer */}
      <p className="text-[11px] text-slate-600 leading-relaxed">
        This is a demo app on Hyperliquid testnet. No real funds.
        Agent key is generated locally and must be approved on-chain before orders execute.
      </p>
    </div>
  );
}
