import { createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { AVAILABLE_CHAINS, getRpcTransport } from "@repo/web3";
import { type Transport } from "viem";

export const wagmiConfig = createConfig({
  chains: AVAILABLE_CHAINS,
  connectors: [injected()],
  transports: AVAILABLE_CHAINS.reduce(
    (obj, chain) => {
      obj[chain.id] = getRpcTransport(chain);
      return obj;
    },
    {} as Record<number, Transport>
  ),
});
