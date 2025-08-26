import { WEB3AUTH_NETWORK, type Web3AuthOptions } from "@web3auth/modal";

const clientId = import.meta.env.VITE_WEB3AUTH_CLIENT_ID;
const defaultChainId = import.meta.env.VITE_DEFAULT_NETWORK_ID_HEX;

console.info("Web3Auth Client ID:", clientId);
console.info("Web3Auth Default Chain ID:", defaultChainId);

const web3AuthOptions: Web3AuthOptions = {
  defaultChainId,
  clientId,
  enableLogging: false,
  web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
};

const web3AuthContextConfig = {
  web3AuthOptions,
};

export default web3AuthContextConfig;
