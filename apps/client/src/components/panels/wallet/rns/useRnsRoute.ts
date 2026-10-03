import { useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { parseRnsInput } from "@repo/web3";
import { RNS_PARAMS, rnsWalletPath } from "./route";

/** The RNS view in the Wallet URL (100 I07). */
export function useRnsRoute() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const rawName = params.get("name");
  const name = rawName ? parseRnsInput(rawName) : null;
  const address = params.get("address");
  const flow = params.get("flow") === "register" && name ? "register" : null;

  const go = useCallback(
    (target: Parameters<typeof rnsWalletPath>[0]) => navigate(rnsWalletPath(target)),
    [navigate]
  );
  const closeFlow = useCallback(
    () =>
      setParams(
        current => {
          const next = new URLSearchParams(current);
          next.delete("flow");
          next.delete("name");
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );

  return { name, address, flow, view: params.get("view"), go, closeFlow };
}

/** Clears the RNS view params when the person leaves the RNS tab. */
export function clearRnsParams(params: URLSearchParams) {
  RNS_PARAMS.forEach(key => params.delete(key));
}

/** True when the Wallet shows an RNS sub page instead of the summary and tabs. */
export function useRnsSubPage() {
  const [params] = useSearchParams();
  return (
    params.get("tab") === "rns" &&
    !!(params.get("address") || (params.get("name") && params.get("flow") !== "register"))
  );
}
