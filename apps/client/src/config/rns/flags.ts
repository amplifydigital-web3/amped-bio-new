/**
 * Revolution Name Service (RNS) flags (Screen Review 100 I06). The master flag
 * turns RNS on; each phase flag sits under it. A surface whose flag is off
 * renders nothing (D07).
 */
const on = (value: string | undefined) => value === "true";

export const RNS_FLAGS = {
  /** Wallet RNS tab, name page Profile tab, Page profile name select, address view */
  enabled: on(import.meta.env.VITE_SHOW_RNS),
  /** Identity tab (103, 104) and the Verified badge on 108 to 111 */
  identity: on(import.meta.env.VITE_SHOW_RNS) && on(import.meta.env.VITE_RNS_IDENTITY),
  /** Live Attributes (105). The Soon tab shows without it (105 D1). */
  attributes: on(import.meta.env.VITE_SHOW_RNS) && on(import.meta.env.VITE_RNS_ATTRIBUTES),
  /** Live Facets and facet requests (106, 107). The Soon tab shows without it (105 D1). */
  facets: on(import.meta.env.VITE_SHOW_RNS) && on(import.meta.env.VITE_RNS_FACETS),
  /** USD by card through Authbase checkout (078 D1, 080 D1) */
  cardCheckout: on(import.meta.env.VITE_SHOW_RNS) && on(import.meta.env.VITE_RNS_CARD_CHECKOUT),
} as const;
