import { WEB3AUTH_NETWORK } from "@web3auth/modal";
import { type Web3AuthContextConfig } from "@web3auth/modal/react";

const clientId = import.meta.env.VITE_WEB3AUTH_CLIENT_ID;

console.info("Web3Auth Client ID:", clientId);

const web3AuthContextConfig: Web3AuthContextConfig = {
  web3AuthOptions: {
    defaultChainId: "0x12085", // revochain testnet chain ID
    clientId,
    enableLogging: true,
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
  },
};

export default web3AuthContextConfig;
