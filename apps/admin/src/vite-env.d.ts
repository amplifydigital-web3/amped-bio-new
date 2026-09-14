/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LANDING_URL: string;
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  ethereum?: {
    request: (args: { method: string; params?: Array<unknown> }) => Promise<unknown>;
    on: (event: string, handler: (arg: unknown) => void) => void;
    removeListener: (event: string, handler: (arg: unknown) => void) => void;
    selectedAddress?: string;
    chainId?: string;
    isMetaMask?: boolean;
  };
}
