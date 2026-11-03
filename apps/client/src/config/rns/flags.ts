/**
 * Revolution Name Service (RNS) flags (Screen Review 100 I06). The master flag
 * turns RNS on; each phase flag sits under it. A surface whose flag is off
 * renders nothing (D07).
 */
import { isFeatureOn } from "../featureFlags";
export const RNS_FLAGS = {
  /** Wallet RNS tab, name page Profile tab, Page profile name select, address view */
  enabled: isFeatureOn("rns"),
  /** Identity tab (103, 104) and the Verified badge on 108 to 111 */
  identity: isFeatureOn("rns") && isFeatureOn("rnsIdentity"),
  /** Live Attributes (105). The Soon tab shows without it (105 D1). */
  attributes: isFeatureOn("rns") && isFeatureOn("rnsAttributes"),
  /** Live Facets and facet requests (106, 107). The Soon tab shows without it (105 D1). */
  facets: isFeatureOn("rns") && isFeatureOn("rnsFacets"),
  /**
   * Facet request dialog over the RNS name page (107). Off everywhere until the
   * Authbase proof API, the facet scopes and the consent hook exist.
   */
  facetRequest: isFeatureOn("rns") && isFeatureOn("rnsIdentity") && isFeatureOn("rnsFacetRequest"),
  /** USD by card through Authbase checkout (078 D1, 080 D1) */
  cardCheckout: isFeatureOn("rns") && isFeatureOn("rnsCardCheckout"),
} as const;
