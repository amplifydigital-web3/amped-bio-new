/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TWITTER_BEARER_TOKEN: string;
  readonly VITE_PUBLIC_WALLETCONNECT_PROJECT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}