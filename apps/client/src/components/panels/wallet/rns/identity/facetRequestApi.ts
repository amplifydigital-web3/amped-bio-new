import type { FacetRequester } from "@repo/ui";

/**
 * Screen Review 107: every read and write of a facet request goes through this
 * one module. The server side does not exist yet:
 * - no Authbase facet credential or proof API,
 * - no facet:<key> scopes in apps/server/src/utils/auth.ts,
 * - no consent hook that writes a FacetProof row and asks Authbase for the proof,
 * - no oauthApps.publicRequester procedure for the verified requester line.
 *
 * Until they ship, `facetRequestApi` is the stub below. It answers
 * "unavailable" for every call, so no screen ever shows invented requests or
 * proof data. Wiring the real API means replacing `facetRequestApi` in this
 * file with tRPC calls that satisfy `FacetRequestApi`.
 */

/** What the owner can do with the requested facet, decided on the server. */
export type FacetOwnerStatus =
  /** The credential holds the claim and it is current */
  | "can_prove"
  /** Claim false, missing or expired (I04) */
  | "cannot_prove"
  /** No verified identity (I08) */
  | "not_verified"
  /** Verified, but the facet needs a higher check (I08) */
  | "tier_too_low";

export interface FacetRequestRecord {
  id: string;
  /** Every scope in the request, for example ["openid", "profile", "facet:age_over_18"] */
  scopes: string[];
  /** The one facet scope this request asks the owner to prove */
  facetScope: string;
  /** From verified data only (I02): rnsName and verified come from the server lookup */
  requester: FacetRequester;
  ownerStatus: FacetOwnerStatus;
  /** Proof lifetime from the server (proof exp, 600 seconds today) (I07) */
  proofTtlSeconds: number;
  /** When the request itself expires, ISO 8601 (10 minutes after it was made) (I07) */
  requestExpiresAt: string;
}

export type FacetRequestLookup =
  | { status: "unavailable" }
  | { status: "not_found" }
  | { status: "expired"; request: FacetRequestRecord }
  | { status: "found"; request: FacetRequestRecord };

export type FacetApproveResult =
  | { status: "unavailable" }
  /** The FacetProof row is written and Authbase made the proof; redirect if given */
  | { status: "shared"; redirectTo: string | null }
  /** Nothing was shared and no FacetProof row exists (I06) */
  | { status: "failed" }
  | { status: "expired" };

export type FacetDeclineResult =
  | { status: "unavailable" }
  /** The app receives access_denied (I04, I09) */
  | { status: "declined"; redirectTo: string | null };

export interface FacetRequestApi {
  /** False while the server side does not exist. The dialog shows the not available state. */
  readonly available: boolean;
  lookup(id: string): Promise<FacetRequestLookup>;
  /**
   * Share proof. The server writes the FacetProof row, asks Authbase for the
   * proof with the client_id as audience and the request nonce, then answers.
   * The client never sends the audience or the nonce.
   */
  approve(id: string): Promise<FacetApproveResult>;
  /**
   * Decline, Escape, close and Close on cannot prove all land here. The app
   * gets the same access_denied response with the same timing (I04).
   */
  decline(id: string): Promise<FacetDeclineResult>;
}

/** The stub until the facet proof API exists. Never returns request or proof data. */
const unavailableFacetRequestApi: FacetRequestApi = {
  available: false,
  lookup: async () => ({ status: "unavailable" }),
  approve: async () => ({ status: "unavailable" }),
  decline: async () => ({ status: "unavailable" }),
};

export const facetRequestApi: FacetRequestApi = unavailableFacetRequestApi;
