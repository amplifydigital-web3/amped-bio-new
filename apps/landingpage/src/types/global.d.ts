// Global browser API declarations used across the landing page

interface Window {
  gtag?: (...args: any[]) => void;
  twq?: any;
  grecaptcha?: {
    enterprise?: {
      ready: (callback: () => void) => Promise<void>;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  };
  ethereum?: {
    request: (args: { method: string; params?: Array<unknown> }) => Promise<unknown>;
    on: (event: string, handler: (arg: unknown) => void) => void;
    removeListener: (event: string, handler: (arg: unknown) => void) => void;
    selectedAddress?: string;
    chainId?: string;
    isMetaMask?: boolean;
  };
}
