// Screen Review 100 I07: the RNS URL model. RNS is the third Wallet tab.
//   /wallet?tab=rns                                   find, my RNS names, about
//   /wallet?tab=rns&name=<label>[&view=<tab>]          RNS name page
//   /wallet?tab=rns&address=<0x>                       address view
//   /wallet?tab=rns&flow=register&name=<label>         register flow (value panel)

export type RnsFlow = "register";

export const RNS_PARAMS = ["name", "view", "address", "flow"] as const;

export function rnsWalletPath(
  target: { name?: string; address?: string; flow?: RnsFlow; view?: string } = {}
): string {
  const params = new URLSearchParams({ tab: "rns" });
  if (target.address) params.set("address", target.address);
  if (target.flow) params.set("flow", target.flow);
  if (target.name) params.set("name", target.name);
  if (target.view) params.set("view", target.view);
  return `/wallet?${params.toString()}`;
}

/** Legacy rns panel ?t= values (register:<label>, profile:<label>, address:<0x>, my-names, home). */
export function legacyRnsPath(t: string | null): string {
  if (!t) return rnsWalletPath();
  const [kind, value] = t.split(":");
  const decoded = value ? decodeURIComponent(value) : "";
  if (kind === "register" && decoded) return rnsWalletPath({ flow: "register", name: decoded });
  if (kind === "profile" && decoded) return rnsWalletPath({ name: decoded });
  if (kind === "address" && decoded) return rnsWalletPath({ address: decoded });
  return rnsWalletPath();
}
