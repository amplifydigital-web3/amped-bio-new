import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { AVAILABLE_CHAINS } from "@repo/web3";

export const wagmiConfig = createConfig({
  chains: AVAILABLE_CHAINS,
  connectors: [injected()],
  transports: AVAILABLE_CHAINS.reduce(
    (obj, chain) => {
      obj[chain.id] = http();
      return obj;
    },
    {} as Record<number, ReturnType<typeof http>>
  ),
});
