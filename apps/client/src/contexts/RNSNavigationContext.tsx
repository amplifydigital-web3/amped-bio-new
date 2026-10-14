import { useLocation, useNavigate } from "react-router";
import { useCallback, useMemo } from "react";
import { parseRnsInput } from "@repo/web3";
import { legacyRnsPath, rnsWalletPath } from "@/components/panels/wallet/rns/route";

// Screen Review 100 I07, 101 I01: RNS lives in the Wallet RNS tab. The rns
// panel only redirects legacy ?t= links; every RNS view is a Wallet URL.

export type RNSView =
  | { type: "home" }
  | { type: "profile"; name: string }
  | { type: "register"; name: string }
  | { type: "address"; address: string };

const label = (name: string) => parseRnsInput(name);

/** The RNS view in the current Wallet URL. */
export function parseRnsView(params: URLSearchParams): RNSView {
  const name = params.get("name");
  const address = params.get("address");
  if (params.get("flow") === "register" && name) return { type: "register", name: label(name) };
  if (address) return { type: "address", address };
  if (name) return { type: "profile", name: label(name) };
  return { type: "home" };
}

export { legacyRnsPath };

export const useRNSNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentView = parseRnsView(new URLSearchParams(location.search));

  const go = useCallback((path: string) => navigate(path), [navigate]);

  return useMemo(
    () => ({
      currentView,
      navigateToHome: () => go(rnsWalletPath()),
      navigateToProfile: (name: string) => go(rnsWalletPath({ name: label(name) })),
      navigateToRegister: (name: string) =>
        go(rnsWalletPath({ flow: "register", name: label(name) })),
      navigateToAddress: (address: string) => go(rnsWalletPath({ address })),
      navigateToSuccess: () => go(rnsWalletPath()),
      navigateToMyNames: () => go(rnsWalletPath()),
      goBack: () => navigate(-1),
    }),
    [currentView, go, navigate]
  );
};
