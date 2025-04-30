import { createContext, useEffect, useState, type ReactNode } from "react";
import { createAppKit } from "@reown/appkit/react";
import { WagmiProvider } from "wagmi";
import { AppKitNetwork } from "@reown/appkit/networks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { networks, projectId, wagmiAdapter } from "../wagmiConfig";
import { ConnectModal } from "./components/ConnectModal";

// 2. Create a metadata object - optional
const metadata = {
  name: "OneLink",
  description: "npayme OneLink",
  url: "onelink.npayme.io",
  icons: [],
};

const modal = createAppKit({
  adapters: [wagmiAdapter],
  networks: networks as [AppKitNetwork, ...AppKitNetwork[]],
  projectId: projectId,
  defaultNetwork: networks[0],
  metadata: metadata,
  //   enableCoinbase: true,
  coinbasePreference: "smartWalletOnly",
  featuredWalletIds: [
    "fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa", // coinbase
    "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0", // trustwallet
  ],
  features: {
    swaps: true,
    socials: ["google", "x", "github", "discord", "apple", "facebook", "farcaster"],
  },
  // siweConfig: siweConfig,
});

export type ModalContextType = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

export const ModalContext = createContext<ModalContextType | null>(null);

export function AppKitProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<boolean>(false);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false, // configure as per your needs
          },
        },
      })
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      document.documentElement.style.setProperty("--npayme__brand-color", "#000");
      document.documentElement.style.setProperty("--npayme__copy-color", "#fff");
      document.documentElement.style.setProperty("--widget-card", "#fff");
      document.documentElement.style.setProperty("--widget-contrast", "#1A1A1A");
      document.documentElement.style.setProperty("--widget-contrast-low", "#A64646");
      document.documentElement.style.setProperty("--widget-contrast-high", "#000");

      document.documentElement.style.setProperty("--bg", "#f2f4f5");
    }
  }, []);

  return (
    <ModalContext.Provider value={{ open, setOpen }}>
      <WagmiProvider config={wagmiAdapter.wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <ConnectModal modal={modal} open={open} setOpen={setOpen} />
          {children}
        </QueryClientProvider>
      </WagmiProvider>
    </ModalContext.Provider>
  );
}
