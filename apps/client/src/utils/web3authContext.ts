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

/**
 * QA-057: the embedded wallet signs and broadcasts through this one RPC with
 * no failover. rpc.revolutionnetwork.dev (the primary read RPC) answers reads
 * but rejects eth_sendRawTransaction after about 40 s with a nested "Response
 * is too big" error, so every stake, send and RNS write sat on "Confirm in
 * wallet". libertas.revolutionchain.io accepts the same signed transaction, so
 * the wallet uses it until the primary endpoint is repaired. Reads elsewhere
 * keep the failover list in @repo/web3; once the primary broadcasts again,
 * set this back to libertasTestnet.rpcUrls.default.http[0].
 */
const WALLET_RPC_URL = "https://libertas.revolutionchain.io";

// Web3Auth merges these over the dashboard chains field by field (same chainId), so only
// the RPC is overridden and logo, ticker and explorer keep coming from the dashboard.
// This keeps the wallet RPC in code instead of per-project dashboard settings.
const rpcOverrides = [
  {
    chainNamespace: CHAIN_NAMESPACES.EIP155,
    chainId: `0x${libertasTestnet.id.toString(16)}`,
    rpcTarget: WALLET_RPC_URL,
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
