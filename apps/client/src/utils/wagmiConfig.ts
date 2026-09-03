import { http, createConfig } from "wagmi";
import { AVAILABLE_CHAINS, revolutionDevnet, libertasTestnet } from "@repo/web3";

export const wagmiConfig = createConfig({
  chains: AVAILABLE_CHAINS,
  transports: {
    [revolutionDevnet.id]: http(),
    [libertasTestnet.id]: http(),
  },
});
