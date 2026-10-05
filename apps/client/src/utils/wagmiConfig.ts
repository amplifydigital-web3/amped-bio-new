import { createConfig } from "wagmi";
import { AVAILABLE_CHAINS, revolutionDevnet, libertasTestnet, getRpcTransport } from "@repo/web3";

export const wagmiConfig = createConfig({
  chains: AVAILABLE_CHAINS,
  transports: {
    [revolutionDevnet.id]: getRpcTransport(revolutionDevnet),
    [libertasTestnet.id]: getRpcTransport(libertasTestnet),
  },
});
