"use client";

import { useState } from "react";
import type { Market } from "@/types/market";
import { MarketList } from "@/components/market-list";
import { MarketDetail } from "@/components/market-detail";
import { ConnectButton } from "@/components/connect-button";

export default function Home() {
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);

  return (
    <div className="min-h-screen" style={{ background: "#0a0f1a" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{ background: "rgba(10,15,26,0.95)", borderColor: "#1e293b", backdropFilter: "blur(8px)" }}
      >
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold"
              style={{ background: "#10b981", color: "#0a0f1a" }}
            >
              P
            </div>
            <div>
              <span className="font-semibold text-sm" style={{ color: "#f1f5f9" }}>purrdict</span>
              <span
                className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded"
                style={{ background: "#0f2a1e", color: "#34d399" }}
              >
                TESTNET
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://github.com/purrdict/hip4-example"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs transition-colors"
              style={{ color: "#64748b" }}
              onMouseOver={(e) => (e.currentTarget.style.color = "#94a3b8")}
              onMouseOut={(e) => (e.currentTarget.style.color = "#64748b")}
            >
              GitHub
            </a>
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Testnet notice */}
      <div
        className="text-center text-xs py-2 px-4"
        style={{ background: "#0f1d30", borderBottom: "1px solid #1e3a5f", color: "#60a5fa" }}
      >
        Connected to <strong>Hyperliquid Testnet</strong> — No real funds. For demonstration only.
      </div>

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
          {/* Left panel — market list */}
          <div>
            <div className="mb-4">
              <h1 className="text-lg font-bold" style={{ color: "#f1f5f9" }}>Prediction Markets</h1>
              <p className="text-sm mt-0.5" style={{ color: "#64748b" }}>
                HIP-4 on Hyperliquid. Click a market to view orderbook and trade.
              </p>
            </div>
            <MarketList
              selectedId={selectedMarket?.outcomeId ?? null}
              onSelect={setSelectedMarket}
            />
          </div>

          {/* Right panel — market detail */}
          <div>
            {selectedMarket ? (
              <div
                className="rounded-xl border p-5 sticky top-20"
                style={{ background: "#0f172a", borderColor: "#1e293b" }}
              >
                <MarketDetail market={selectedMarket} />
              </div>
            ) : (
              <div
                className="rounded-xl border flex flex-col items-center justify-center min-h-[400px] text-center p-8"
                style={{ background: "#0f172a", borderColor: "#1e293b" }}
              >
                <div className="text-4xl mb-4">📊</div>
                <p className="font-medium mb-1" style={{ color: "#94a3b8" }}>Select a market</p>
                <p className="text-sm" style={{ color: "#475569" }}>
                  Click any market from the list to view the live orderbook and place trades.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 pb-8 text-center">
        <p className="text-xs" style={{ color: "#334155" }}>
          Open source example app for{" "}
          <a
            href="https://purrdict.xyz"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#10b981" }}
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
