"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2.5">
        <span
          className="text-[12px] font-mono tabular-nums px-2.5 py-1 rounded-lg"
          style={{
            background: "var(--muted)",
            color: "var(--muted-foreground)",
            border: "1px solid var(--border)",
          }}
        >
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        <button
          onClick={() => disconnect()}
          className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
          style={{
            background: "var(--muted)",
            color: "var(--muted-foreground)",
            border: "1px solid var(--border)",
          }}
          onMouseOver={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "oklch(0.30 0.008 50)";
            (e.currentTarget as HTMLElement).style.color = "var(--foreground)";
          }}
          onMouseOut={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
            (e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)";
          }}
        >
          Disconnect
        </button>
      </div>
    );
  }

  const injectedConnector = connectors.find((c) => c.type === "injected");

  return (
    <button
      onClick={() => injectedConnector && connect({ connector: injectedConnector })}
      disabled={isPending || !injectedConnector}
      className="px-4 py-2 text-xs font-semibold rounded-lg transition-all"
      style={{
        background: "var(--primary)",
        color: "var(--primary-foreground)",
        opacity: isPending || !injectedConnector ? 0.5 : 1,
        cursor: isPending || !injectedConnector ? "not-allowed" : "pointer",
      }}
    >
      {isPending ? "Connecting…" : injectedConnector ? "Connect Wallet" : "No Wallet"}
    </button>
  );
}
