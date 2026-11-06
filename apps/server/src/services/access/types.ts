import type { AccessResourceType } from "@repo/constants";

/** Always built on the server from the session (ctx.user), never from client input. */
export type Viewer = {
  userId: number | null;
  wallet: string | null;
  /** For signed out viewers: the request, to derive the daily salted visitor key */
  request?: { ip: string; userAgent: string };
};

/** What a resolver says about one resource. */
export type Gate = {
  ownerUserId: number;
  ruleId: Buffer | null;
  adult: boolean;
  /** False when the resource is missing from public view (draft, deleted, wrong type) */
  available: boolean;
  /**
   * False when even the owner may not open it (content: not READY, moderation
   * BLOCKED, or a served asset that failed its scan), matching ownerCanOpen.
   * Omitted means the owner always passes.
   */
  ownerCanOpen?: boolean;
};

export type Resolver = { get(id: string): Promise<Gate | null> };

export type ResolverRegistry = Map<AccessResourceType, Resolver>;

/**
 * What the engine needs from payments for the `paid` kind (spec 3.3 and 3.7). The engine
 * never reads Purchase rows itself; the registered verifier does (G4, UsdcPaymentVerifier).
 */
export type PaidOffer = {
  ownerUserId: number;
  /** draft | active | paused | archived */
  status: string;
  /** USDC units, 6 decimals */
  amountUnits: bigint;
};

/**
 * purchased: final and inside its access window. confirming: first chain confirmation,
 * not final yet (soft unlock, decision 5). pending: sent, not on chain yet. none: nothing
 * that gives access (never bought, failed, expired, refunded or past its window).
 */
export type PurchaseState = "purchased" | "confirming" | "pending" | "none";

/**
 * What the engine needs from memberships for the `member` kind (spec 3.3 and 3.7, G5). The
 * engine never reads Membership rows itself; the registered reader does.
 */
export type MemberPlan = {
  ownerUserId: number;
  /** draft | active | paused */
  status: string;
  /** USDC units every 30 days, for the Join hint */
  amountEvery30Days: bigint;
};

/**
 * active: paid through the period (or canceled, still inside it). grace: past due, inside
 * the 7 day grace (access stays). ended: it was a membership and access has closed.
 * none: never a member of this creator.
 */
export type MembershipState = "active" | "grace" | "ended" | "none";

export type MembershipReader = {
  plan(planIdHex: string): Promise<MemberPlan | null>;
  membership(userId: number, creatorUserId: number, now?: Date): Promise<MembershipState>;
};

export type PaymentVerifier = {
  offer(offerIdHex: string): Promise<PaidOffer | null>;
  verifyPurchase(userId: number, offerIdHex: string, now?: Date): Promise<PurchaseState>;
};
