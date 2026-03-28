"use client";

import { useState } from "react";
import type { Market } from "@/types/market";
import { MarketList } from "@/components/market-list";
import { MarketDetail } from "@/components/market-detail";
import { ConnectButton } from "@/components/connect-button";

export default function Home() {
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{
          background: "oklch(0.09 0.008 50 / 0.92)",
          borderColor: "var(--border)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold font-display"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
            >
              P
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-display font-semibold text-sm" style={{ color: "var(--foreground)" }}>
                purrdict
              </span>
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded font-mono tracking-wider"
                style={{ background: "oklch(0.93 0.26 128 / 0.12)", color: "var(--primary)" }}
              >
                TESTNET
              </span>
            </div>
          </div>

          {/* Nav */}
          <div className="flex items-center gap-5">
            <a
              href="https://purrdict.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs transition-colors"
              style={{ color: "var(--muted-foreground)" }}
              onMouseOver={(e) => (e.currentTarget.style.color = "var(--foreground)")}
              onMouseOut={(e) => (e.currentTarget.style.color = "var(--muted-foreground)")}
            >
              purrdict.xyz
            </a>
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* ── Testnet notice ───────────────────────────────────────── */}
      <div
        className="text-center text-[11px] py-1.5 px-4 font-mono"
        style={{
          background: "oklch(0.15 0.04 250 / 0.5)",
          borderBottom: "1px solid oklch(0.25 0.05 250 / 0.4)",
          color: "oklch(0.72 0.08 250)",
        }}
      >
        Connected to <strong>Hyperliquid Testnet</strong> — no real funds, for demonstration only
      </div>

      {/* ── Main content ────────────────────────────────────────── */}
      <div className="max-w-screen-xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">

          {/* Left — market list */}
          <div>
            <div className="mb-5">
              <h1
                className="text-xl font-display font-semibold"
                style={{ color: "var(--foreground)" }}
              >
                Prediction Markets
              </h1>
              <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
                HIP-4 on Hyperliquid. Click to view orderbook and trade.
              </p>
            </div>
            <MarketList
              selectedId={selectedMarket?.outcomeId ?? null}
              onSelect={setSelectedMarket}
            />
          </div>

          {/* Right — market detail */}
          <div>
            {selectedMarket ? (
              <div
                className="rounded-xl border sticky top-20"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}
              >
                <MarketDetail market={selectedMarket} />
              </div>
            ) : (
              <div
                className="rounded-xl border flex flex-col items-center justify-center min-h-[480px] text-center p-8 sticky top-20"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}
              >
                <div className="mb-4">
                  <svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    style={{ color: "var(--border)", margin: "0 auto" }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="m7 16 4-4 4 4 3-6" />
                  </svg>
                </div>
                <p
                  className="font-display font-medium text-base mb-1.5"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Select a market
                </p>
                <p className="text-sm leading-relaxed" style={{ color: "oklch(0.40 0.007 70)" }}>
                  Click any market from the list to view the live orderbook and place orders.
                </p>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="mt-16 pb-8 text-center">
        <p className="text-xs" style={{ color: "oklch(0.32 0.007 70)" }}>
          Open source example for{" "}
          <a
            href="https://purrdict.xyz"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--primary)" }}
            className="hover:underline"
          >
            purrdict.xyz
          </a>
          {" "}— HIP-4 prediction markets on Hyperliquid
        </p>
      </footer>
    </div>
  );
}
