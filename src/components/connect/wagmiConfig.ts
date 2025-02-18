import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import {
  mainnet,
  sepolia,
  polygon,
  baseSepolia,
  base,
  AppKitNetwork,
} from '@reown/appkit/networks';

export const projectId = (import.meta.env.VITE_PUBLIC_WALLETCONNECT_PROJECT_ID ||
  '64c300c731392456340fe626355b366e') as string;

if (!projectId) {
  throw new Error('Project ID is not defined');
}

export const networks: AppKitNetwork[] = [
  mainnet,
  sepolia,
  polygon,
  baseSepolia,
  base,
];

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: false,
});
