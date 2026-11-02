/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LANDINGPAGE_URL: string;
  readonly VITE_SHOW_REWARD: string;
  readonly VITE_SHOW_CREATOR_POOL: string;
  readonly VITE_SHOW_RNS: string;
  /** RNS phase flags under VITE_SHOW_RNS (Screen Review 100 I06) */
  readonly VITE_RNS_IDENTITY?: string;
  readonly VITE_RNS_ATTRIBUTES?: string;
  readonly VITE_RNS_FACETS?: string;
  /** Facet request dialog (Screen Review 107). Off until the proof API exists. */
  readonly VITE_SHOW_FACET_REQUEST?: string;
  /** USD by card through Authbase checkout (078 D1, 080 D1). Off until wired. */
  readonly VITE_RNS_CARD_CHECKOUT?: string;
  readonly VITE_SHOW_GALLERY: string;
  readonly VITE_API_URL: string;
  readonly VITE_AUTH_URL: string;
  readonly VITE_DEMO_MODE: string;
  // web3
  readonly VITE_WEB3AUTH_CLIENT_ID: string;
  readonly VITE_WEB3AUTH_AUTH_CONNECTION_ID: string;
  readonly VITE_WEB3AUTH_NETWORK: string;
  readonly VITE_SHOW_WALLET: string;
  readonly VITE_FAN_GRAPH?: string;
  /** Content destination, Library tab (Build Board #20, content system PR 5) */
  readonly VITE_CONTENT?: string;
  /** Mobile checkout (Build Board #49): the resume bar and, from CK-2, the pay page */
  readonly VITE_CHECKOUT?: string;
  /** Explore NFTs tab (Screen Review 044, D07). Off until NFT data exists. */
  readonly VITE_SHOW_NFTS?: string;
  /** Creator Pool Broadcast (Build Board #1): My Pool Broadcasts tab and the Inbox */
  readonly VITE_SHOW_BROADCAST: string;
  /** Messaging on Telegram (Build Board #2): Account, Telegram link and the composer's Telegram channel */
  readonly VITE_SHOW_TELEGRAM?: string;
  readonly VITE_DEFAULT_NETWORK_ID_HEX: `0x${string}`;
  /** USDC in the wallet (Build Board #29, Screen Review 137). Base beside Libertas. */
  readonly VITE_USDC_WALLET?: string;
  /** Buy USDC through Coinbase (Build Board #5, Screen Review 138). Needs VITE_USDC_WALLET. */
  readonly VITE_USDC_ONRAMP?: string;
  /** The chain that carries USDC: "base" in production, "base-sepolia" on staging */
  readonly VITE_PAYMENT_CHAIN?: string;
  // google
  readonly VITE_CAPTCHA_SERVER_URL: string;
  readonly VITE_CAPTCHA_SITE_KEY: string;
  readonly VITE_GOOGLE_CLIENT_ID: string;
  // ndau account
  readonly VITE_NDAU_SOCKET_URL: string;
  // namesonchain (revo)
  readonly VITE_RNS_URL: string;
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
  gtag?: (...args: any[]) => void;
  ethereum?: {
    request: (args: { method: string; params?: Array<unknown> }) => Promise<unknown>;
    on: (event: string, handler: (arg: unknown) => void) => void;
    removeListener: (event: string, handler: (arg: unknown) => void) => void;
    selectedAddress?: string;
    chainId?: string;
    isMetaMask?: boolean;
  };
}

declare module "*.lottie";
