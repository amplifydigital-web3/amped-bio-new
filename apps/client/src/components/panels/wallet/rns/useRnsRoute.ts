import { useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { parseRnsInput } from "@repo/web3";
import { NAME_PAGE_FLOWS, RNS_PARAMS, rnsWalletPath, type NamePageFlow } from "./route";

/** The RNS view in the Wallet URL (100 I07). */
export function useRnsRoute() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const rawName = params.get("name");
  const name = rawName ? parseRnsInput(rawName) : null;
  const address = params.get("address");
  const rawFlow = params.get("flow");
  const flow = rawFlow === "register" && name ? "register" : null;
  const nameFlow =
    name && NAME_PAGE_FLOWS.includes(rawFlow as NamePageFlow) ? (rawFlow as NamePageFlow) : null;

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
  /** Opens or closes a name page flow and keeps the name and view (080, 111). */
  const setNameFlow = useCallback(
    (next: NamePageFlow | null) =>
      setParams(
        current => {
          const updated = new URLSearchParams(current);
          if (next) updated.set("flow", next);
          else updated.delete("flow");
          return updated;
        },
        { replace: !next }
      ),
    [setParams]
  );
  /** Switches the name page tab in the URL (102 I01). */
  const setView = useCallback(
    (view: string) =>
      setParams(
        current => {
          const updated = new URLSearchParams(current);
          updated.set("view", view);
          updated.delete("flow");
          return updated;
        },
        { replace: true }
      ),
    [setParams]
  );

  return {
    name,
    address,
    flow,
    nameFlow,
    view: params.get("view"),
    go,
    closeFlow,
    setNameFlow,
    setView,
  };
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
