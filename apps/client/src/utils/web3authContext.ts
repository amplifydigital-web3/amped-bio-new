import {
  CHAIN_NAMESPACES,
  type CustomChainConfig,
  type WEB3AUTH_NETWORK_TYPE,
  type Web3AuthOptions,
} from "@web3auth/modal";
import { libertasTestnet } from "@repo/web3";

const clientId = import.meta.env.VITE_WEB3AUTH_CLIENT_ID;
const defaultChainId = import.meta.env.VITE_DEFAULT_NETWORK_ID_HEX;
const web3AuthNetwork = import.meta.env.VITE_WEB3AUTH_NETWORK as WEB3AUTH_NETWORK_TYPE;

// console.info("Web3Auth Client ID:", clientId);
// console.info("Web3Auth Default Chain ID:", defaultChainId);

// Web3Auth merges these over the dashboard chains field by field (same chainId), so only
// the RPC is overridden and logo, ticker and explorer keep coming from the dashboard.
// This keeps the wallet RPC in code instead of per-project dashboard settings.
const rpcOverrides = [
  {
    chainNamespace: CHAIN_NAMESPACES.EIP155,
    chainId: `0x${libertasTestnet.id.toString(16)}`,
    rpcTarget: libertasTestnet.rpcUrls.default.http[0],
  },
] as CustomChainConfig[];

const web3AuthOptions: Web3AuthOptions = {
  defaultChainId,
  clientId,
  enableLogging: false,
  web3AuthNetwork: web3AuthNetwork,
  chains: rpcOverrides,
};

const web3AuthContextConfig = {
  web3AuthOptions,
};

export default web3AuthContextConfig;
