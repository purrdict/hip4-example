"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";
import { HIP4Provider } from "@purrdict/hip4-ui";

const queryClient = new QueryClient();

/**
 * Root providers for the example app.
 *
 * HIP4Provider wraps the entire tree so that any hip4-ui hook
 * (useMarkets, useOrderbook, useTrade, etc.) can be called without
 * passing a client explicitly:
 *
 *   // In any descendant component:
 *   const { markets } = useMarkets()     // reads client from HIP4Provider
 *   const { bids }   = useOrderbook(coin) // same
 *
 * You can still pass an explicit client to override the context:
 *   const { markets } = useMarkets(explicitClient)
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <HIP4Provider testnet={true}>
          {children}
        </HIP4Provider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
