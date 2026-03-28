import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "HIP-4 SDK Example",
  description: "Example app demonstrating HIP-4 prediction markets on Hyperliquid testnet",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased min-h-screen" style={{ background: "#0a0f1a", color: "#e2e8f0" }}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
