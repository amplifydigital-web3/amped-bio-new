import { type WEB3AUTH_NETWORK_TYPE, type Web3AuthOptions } from "@web3auth/modal";

const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID ?? "";
const defaultChainId = process.env.NEXT_PUBLIC_DEFAULT_NETWORK_ID_HEX as `0x${string}` | undefined;
const web3AuthNetwork = process.env.NEXT_PUBLIC_WEB3AUTH_NETWORK as WEB3AUTH_NETWORK_TYPE | undefined;

const web3AuthOptions: Web3AuthOptions = {
  defaultChainId,
  clientId,
  enableLogging: false,
  web3AuthNetwork: web3AuthNetwork ?? "sapphire_devnet",
};

const web3AuthContextConfig = {
  web3AuthOptions,
};

export default web3AuthContextConfig;