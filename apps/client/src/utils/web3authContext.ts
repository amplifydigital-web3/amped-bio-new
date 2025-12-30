import { type WEB3AUTH_NETWORK_TYPE, type Web3AuthOptions } from "@web3auth/modal";

const clientId = import.meta.env.VITE_WEB3AUTH_CLIENT_ID;
const defaultChainId = import.meta.env.VITE_DEFAULT_NETWORK_ID_HEX;
const web3AuthNetwork = import.meta.env.VITE_WEB3AUTH_NETWORK as WEB3AUTH_NETWORK_TYPE;

// console.info("Web3Auth Client ID:", clientId);
// console.info("Web3Auth Default Chain ID:", defaultChainId);

const web3AuthOptions: Web3AuthOptions = {
  defaultChainId,
  clientId,
  enableLogging: false,
  web3AuthNetwork: web3AuthNetwork,
};

const web3AuthContextConfig = {
  web3AuthOptions,
};

export default web3AuthContextConfig;
