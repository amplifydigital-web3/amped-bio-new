/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LANDINGPAGE_URL: string;
  readonly VITE_API_URL: string;
  readonly VITE_AUTH_URL: string;
  // Editor origin for Open editor (087 I02, I03)
  readonly VITE_PANEL_URL?: string;
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
