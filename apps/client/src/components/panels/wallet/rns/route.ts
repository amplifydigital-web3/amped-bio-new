// Screen Review 100 I07: the RNS URL model. RNS is the third Wallet tab.
//   /wallet?tab=rns                                   find, my RNS names, about
//   /wallet?tab=rns&name=<label>[&view=<tab>]          RNS name page (profile, identity,
//                                                     attributes, facets)
//   /wallet?tab=rns&address=<0x>                       address view
//   /wallet?tab=rns&flow=register&name=<label>         register flow (value panel)
//   /wallet?tab=rns&name=<label>&flow=extend|transfer|publish
//                                                     name page flows (080, 111)
//   /wallet?tab=rns&name=<label>&view=facets&request=<id>
//                                                     facet request dialog (107)

export type RnsFlow = "register" | "extend" | "transfer" | "publish";

/** Flows that open over the RNS name page (080, 111). Register opens over the tab. */
export const NAME_PAGE_FLOWS = ["extend", "transfer", "publish"] as const;
export type NamePageFlow = (typeof NAME_PAGE_FLOWS)[number];

/** Name page views (102 I01, 105 I03). Profile is the default. */
export const NAME_VIEWS = ["profile", "identity", "attributes", "facets"] as const;
export type NameView = (typeof NAME_VIEWS)[number];

export const RNS_PARAMS = ["name", "view", "address", "flow", "request"] as const;

export function rnsWalletPath(
  target: { name?: string; address?: string; flow?: RnsFlow; view?: string; request?: string } = {}
): string {
  const params = new URLSearchParams({ tab: "rns" });
  if (target.address) params.set("address", target.address);
  if (target.flow) params.set("flow", target.flow);
  if (target.name) params.set("name", target.name);
  if (target.view) params.set("view", target.view);
  if (target.request) params.set("request", target.request);
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
