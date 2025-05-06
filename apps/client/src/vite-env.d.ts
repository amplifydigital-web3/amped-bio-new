/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VERCEL_ENV?: string;
  readonly VITE_REWARD_URL: string;
  readonly VITE_PUBLIC_WALLETCONNECT_PROJECT_ID: string;
  readonly VITE_SHOW_REWARD: string;
  readonly VITE_SHOW_CREATOR_POOL: string;
  readonly VITE_SHOW_RNS: string;
  readonly VITE_SHOW_GALLERY: string;
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Freshworks Widget global variables
interface Window {
  fwSettings?: {
    widget_id: number;
  };
  FreshworksWidget?: any;
}