import { WEB3AUTH_NETWORK, type Web3AuthOptions } from "@web3auth/modal";

const clientId = import.meta.env.VITE_WEB3AUTH_CLIENT_ID;

console.info("Web3Auth Client ID:", clientId);

const web3AuthOptions: Web3AuthOptions = {
  defaultChainId: "0x12085", // revochain testnet chain ID
  clientId,
  enableLogging: true,
  web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
};

const web3AuthContextConfig = {
  web3AuthOptions,
};

export default web3AuthContextConfig;
