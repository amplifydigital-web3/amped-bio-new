/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VERCEL_ENV?: string;
  readonly VITE_REWARD_URL: string;
  readonly VITE_SHOW_REWARD: string;
  readonly VITE_SHOW_CREATOR_POOL: string;
  readonly VITE_SHOW_RNS: string;
  readonly VITE_SHOW_GALLERY: string;
  readonly VITE_API_URL: string;
  readonly VITE_DEMO_MODE: string;
  readonly VITE_WEB3AUTH_CLIENT_ID: string;
  readonly VITE_WEB3AUTH_AUTH_CONNECTION_ID: string;
  readonly VITE_WEB3AUTH_NETWORK: string;
  readonly VITE_RECAPTCHA_SITE_KEY: string;
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

declare module "*.lottie";
