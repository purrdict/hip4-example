/**
 * Wagmi configuration for hip4-example.
 *
 * CRITICAL: Support many chains so useWalletClient() returns non-null
 * regardless of what chain the user is connected to.
 * Hyperliquid accepts ANY chainId in EIP-712 domain.
 */
import { createConfig, http } from "wagmi";
import {
  mainnet,
  arbitrum,
  arbitrumSepolia,
  base,
  optimism,
  polygon,
} from "wagmi/chains";
import { injected } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [mainnet, arbitrum, arbitrumSepolia, base, optimism, polygon],
  connectors: [injected()],
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [arbitrumSepolia.id]: http(),
    [base.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
  },
  ssr: true,
});
