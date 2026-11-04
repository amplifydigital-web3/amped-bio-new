/**
 * Memberships core (MB-1, Build Board #25 and #51). Memberships spec (8 Oct) with amendment 1
 * (2 Nov) and docs/features/ampedmemberships.md. One plan per creator (decision 6), billed
 * every 30 days or yearly, joined on AmpedMemberships with a split signed once at join.
 * Renewals: a readiness check 3 days before each charge, then a 7 day grace with access
 * kept, reminders on day 1, 3 and 6, and the end on day 7.
 *
 * Copy: amounts read $N USDC, the 30 day plan reads "every 30 days", never "a month" or
 * "monthly"; no "price" in shipped copy; no dashes.
 */
import { z } from "zod";

export const MEMBERSHIP_INTERVALS = ["every_30_days", "yearly"] as const;
export type MembershipInterval = (typeof MEMBERSHIP_INTERVALS)[number];

export const MEMBERSHIP_PERIOD_SECONDS: Record<MembershipInterval, number> = {
  every_30_days: 30 * 24 * 60 * 60,
  yearly: 365 * 24 * 60 * 60,
};

/** Periods one permit covers at join (ampedmemberships.md 4): 12 or 2. */
export const MEMBERSHIP_ALLOWANCE_PERIODS: Record<MembershipInterval, number> = {
  every_30_days: 12,
  yearly: 2,
};

/** Amount bounds per interval in USDC units (memberships decision 7). */
export const MEMBERSHIP_AMOUNT_BOUNDS: Record<MembershipInterval, { min: bigint; max: bigint }> = {
  every_30_days: { min: 1_000_000n, max: 500_000_000n },
  yearly: { min: 10_000_000n, max: 5_000_000_000n },
};

export const MEMBERSHIP_LIMITS = {
  nameMax: 40,
  descriptionMax: 280,
  benefitsMax: 6,
  benefitMax: 80,
  /** The readiness check runs this many days before a charge (amendment 1) */
  readinessDays: 3,
  /** Access stays this many days after a missed charge (D7) */
  graceDays: 7,
  /** Reminder days inside the grace */
  reminderDays: [1, 3, 6] as readonly number[],
  /** A join table and the member's permit live this long */
  joinWindowSeconds: 10 * 60,
  cancelWindowSeconds: 10 * 60,
  /** Under this many members the count is never shown (board mb10) */
  memberCountFloor: 10,
} as const;

export const MEMBERSHIP_PLAN_STATUSES = ["draft", "active", "paused"] as const;
export type MembershipPlanStatus = (typeof MEMBERSHIP_PLAN_STATUSES)[number];

/**
 * A membership's life: prepared (join table built), joining (sent), active, past_due (a
 * charge failed, inside the grace), canceled (no more charges, access to the period end),
 * ended (access over), failed (the join never landed).
 */
export const MEMBERSHIP_STATUSES = [
  "prepared",
  "joining",
  "active",
  "past_due",
  "canceled",
  "ended",
  "failed",
] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** Statuses that open members only items while the period lasts. */
export const MEMBERSHIP_ACCESS_STATUSES = ["active", "past_due", "canceled"] as const;

export const MEMBERSHIP_END_REASONS = [
  "member_canceled",
  "past_due",
  "seller_lapsed",
  "plan_removed",
  "account_deleted",
] as const;
export type MembershipEndReason = (typeof MEMBERSHIP_END_REASONS)[number];

/** "12.50" or "12" in dollars, to USDC units. Null when it is not an amount. */
export function dollarsToUnits(value: string): bigint | null {
  const match = value.trim().match(/^(\d{1,7})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  return BigInt(match[1]!) * 1_000_000n + BigInt((match[2] ?? "").padEnd(2, "0")) * 10_000n;
}

const unitsString = z.string().regex(/^\d{1,13}$/);

export const membershipPlanUpsertSchema = z.object({
  name: z.string().trim().min(1).max(MEMBERSHIP_LIMITS.nameMax),
  description: z.string().trim().max(MEMBERSHIP_LIMITS.descriptionMax).optional(),
  benefits: z
    .array(z.string().trim().min(1).max(MEMBERSHIP_LIMITS.benefitMax))
    .max(MEMBERSHIP_LIMITS.benefitsMax),
  /** USDC units every 30 days */
  amountEvery30Days: unitsString,
  /** USDC units a year; absent or null for every 30 days only */
  amountYearly: unitsString.nullable().optional(),
  showMemberCount: z.boolean().default(true),
});
export type MembershipPlanUpsert = z.infer<typeof membershipPlanUpsertSchema>;

export const membershipPlanStatusSchema = z.object({ status: z.enum(MEMBERSHIP_PLAN_STATUSES) });

const hex32 = z.string().regex(/^[0-9a-f]{32}$/);
const sig65 = z.string().regex(/^0x[0-9a-fA-F]{130}$/);

export const membershipJoinPrepareSchema = z.object({
  handle: z.string().trim().min(1).max(64),
  interval: z.enum(MEMBERSHIP_INTERVALS),
  /** The fan's live wallet, refused when it is not the account's wallet */
  signer: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),
});
export const membershipJoinSubmitSchema = z.object({
  membershipId: hex32,
  memberSignature: sig65,
  permitSignature: sig65,
});
export const membershipIdSchema = z.object({ membershipId: hex32 });
export const membershipCancelSubmitSchema = z.object({
  membershipId: hex32,
  deadline: z.string().regex(/^\d{1,12}$/),
  signature: sig65,
});
export const membershipMembersSchema = z
  .object({
    filter: z.enum(["all", "every_30_days", "yearly", "in_grace", "ended"]).default("all"),
    cursor: hex32.optional(),
  })
  .optional();

/** What a creator sees about their plan (st4, MB-2 draws it). */
export interface MembershipPlanOut {
  id: string;
  name: string;
  description: string | null;
  benefits: string[];
  amountEvery30Days: string;
  amountYearly: string | null;
  /** Yearly against 12 periods of every 30 days, in whole percent; null without yearly */
  yearlySavingPercent: number | null;
  status: MembershipPlanStatus;
  showMemberCount: boolean;
  version: number;
  activeMembers: number;
}

/** The plan as anyone sees it on a store or bio (no count under the floor). */
export interface MembershipPlanPublic {
  id: string;
  handle: string;
  /** The seller named on the join sheet: the live store policy's seller name */
  sellerName: string;
  /** The live store policy version the join links */
  policyVersion: number | null;
  name: string;
  description: string | null;
  benefits: string[];
  amountEvery30Days: string;
  amountYearly: string | null;
  yearlySavingPercent: number | null;
  memberCount: number | null;
  /** The viewer's own membership, when signed in */
  viewer: { status: MembershipStatus; accessUntil: string | null } | null;
}

export interface MembershipJoinTypedData {
  join: {
    domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` };
    message: {
      subscriptionRef: `0x${string}`;
      planRef: `0x${string}`;
      member: `0x${string}`;
      price: string;
      periodSeconds: number;
      recipients: { to: `0x${string}`; bps: number; role: number }[];
      validBefore: string;
    };
  };
  permit: {
    domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` };
    message: {
      owner: `0x${string}`;
      spender: `0x${string}`;
      value: string;
      nonce: string;
      deadline: string;
    };
  };
}

export type MembershipRefusal =
  | "not_found"
  | "own_plan"
  | "already_member"
  | "seller"
  | "paused"
  | "no_wallet"
  | "wallet_mismatch"
  | "insufficient_balance"
  | "screening"
  | "expired"
  | "signature"
  | "relayer";

export type MembershipJoinPrepareResult =
  | {
      refused: false;
      membershipId: string;
      amount: string;
      fee: string;
      interval: MembershipInterval;
      /** The allowance the permit sets: every membership's remaining periods together */
      allowance: string;
      sellerName: string;
      storePolicyVersion: number | null;
      signer: `0x${string}`;
      typed: MembershipJoinTypedData;
    }
  | { refused: true; reason: MembershipRefusal; shortBy?: string };

export type MembershipSubmitResult =
  | { refused: false; membershipId: string; status: MembershipStatus; txHash: string | null }
  | { refused: true; reason: MembershipRefusal };

export interface MembershipMine {
  id: string;
  creator: { handle: string; name: string | null };
  planName: string;
  interval: MembershipInterval;
  amount: string;
  status: MembershipStatus;
  /** Access runs to this time (the period end, or the grace end when past due) */
  accessUntil: string | null;
  nextChargeAt: string | null;
  graceDay: number | null;
}

/** A member row in People, Members (board mb1). Name and handle only. */
export interface MemberRow {
  id: string;
  member: { name: string | null; handle: string | null } | null;
  interval: MembershipInterval;
  amount: string;
  state: "active" | "not_ready" | "in_grace" | "ended" | "renewal_paused";
  graceDay: number | null;
  accessUntil: string | null;
  endedAt: string | null;
  joinedAt: string;
}

/** Whole percent saved by yearly against 12 periods of every 30 days. */
export function yearlySavingPercent(every30: bigint, yearly: bigint | null): number | null {
  if (!yearly || every30 <= 0n) return null;
  const twelve = every30 * 12n;
  if (yearly >= twelve) return null;
  return Number(((twelve - yearly) * 100n) / twelve);
}

/** Day N of 7 inside the grace, from the missed due date. */
export function graceDay(pastDueSince: Date, now: Date): number {
  return Math.min(
    MEMBERSHIP_LIMITS.graceDays,
    Math.max(1, Math.floor((now.getTime() - pastDueSince.getTime()) / 86_400_000) + 1)
  );
}

/** Interval words: "every 30 days", "a year". */
export const MEMBERSHIP_INTERVAL_WORDS: Record<MembershipInterval, string> = {
  every_30_days: "every 30 days",
  yearly: "a year",
};

/** Renewal reminder and status copy (amendment 1, boards r1 to r3, mb1). */
export const MEMBERSHIP_COPY = {
  bell: {
    notReady: (handle: string) => `@${handle} renews in 3 days. Add USDC to keep your membership.`,
    pastDue: (handle: string, day: number) =>
      `Your @${handle} membership is past due, day ${day} of 7. Add USDC to keep access.`,
  },
  email: {
    subjectNotReady: (seller: string) => `Your ${seller} membership renews in 3 days`,
    subjectPastDue: (seller: string) => `Your ${seller} membership needs USDC`,
    notReady: (seller: string, amount: string, interval: string, date: string) =>
      `Your membership with ${seller} renews on ${date} for ${amount} ${interval}. Your wallet does not have enough USDC for it yet.`,
    pastDue: (seller: string, amount: string, day: number, until: string) =>
      `The ${amount} renewal for your membership with ${seller} did not go through. This is day ${day} of 7. You keep access until ${until}.`,
    addUsdc: "Add USDC",
    soldBy: (seller: string) => `Sold by ${seller} on Amped.bio.`,
    policy: "Store policy",
    manage: "You can cancel any time in your Library, Memberships.",
  },
  push: {
    title: "Membership renewal",
  },
  states: {
    active: "Active",
    not_ready: "Not ready, reminded",
    in_grace: (day: number) => `In grace, day ${day} of 7`,
    ended: (date: string) => `Ended ${date}`,
    renewal_paused: "Renewal paused",
  },
  accessUntil: (date: string) => `Access until ${date}`,
  newAmounts: "New amounts apply to new members only.",
  refusals: {
    not_found: "This membership is not available.",
    own_plan: "This is your own membership.",
    already_member: "You are already a member.",
    seller: "This creator can not take payments right now. Nothing was taken from your wallet.",
    paused: "Payments are paused right now. Try again later.",
    no_wallet: "Set up your wallet first.",
    wallet_mismatch: "Your wallet changed. Sign in again and try once more.",
    insufficient_balance: "Your wallet needs more USDC.",
    screening: "This payment can not go through.",
    expired: "This join expired. Start again.",
    signature: "The signature did not match. Start again.",
    relayer: "The payment could not be sent. Nothing left your wallet. Try again.",
  } satisfies Record<MembershipRefusal, string>,
  /** The join sheet (mobile checkout 11, board c2) */
  join: {
    title: (handle: string) => `Join @${handle}`,
    intervals: { every_30_days: "Every 30 days", yearly: "Yearly" } satisfies Record<
      MembershipInterval,
      string
    >,
    review: (amount: string, interval: MembershipInterval) =>
      `${amount} today, then ${amount} ${MEMBERSHIP_INTERVAL_WORDS[interval]} from your wallet. Cancel any time.`,
    consent: (seller: string, interval: MembershipInterval) =>
      interval === "yearly"
        ? `I agree to yearly renewals and to ${seller}'s store policy.`
        : `I agree to renewals every 30 days and to ${seller}'s store policy.`,
    fee: (percent: number) => `Includes the Amped.Bio fee of ${percent}%`,
    details: "Details",
    allowance: (amount: string) =>
      `Your wallet lets Amped.Bio memberships take up to ${amount} for renewals. You can cancel any time.`,
    commit: (amount: string) => `Join for ${amount}`,
    policy: "Store policy",
    notTaking: "Not taking new members right now",
    member: "You are a member",
    signing: "Confirm in your wallet",
    sending: "Joining",
    /** Still landing after the poll: never say nothing was taken, the join may be on chain */
    pending: "Your join is still confirming. It will show in your Library in a moment.",
    done: "You are a member.",
    open: "Open in your Library",
    short: (shortBy: string) => `Your wallet needs ${shortBy} more.`,
    addUsdc: "Add USDC",
    rejected: "You cancelled in your wallet. Nothing was taken.",
    notFound: "This membership is not available.",
  },
  /** The storefront membership card and the product page line (MB-2, board st4 and s3) */
  card: {
    heading: "Membership",
    amount: (amount: string) => `${amount} every 30 days`,
    yearly: (amount: string, saving: number | null) =>
      saving ? `or ${amount} a year, save ${saving}%` : `or ${amount} a year`,
    members: (count: number) => `${count} members`,
    join: "Join",
    alsoIn: (plan: string) => `Also included in ${plan}.`,
    joinInstead: "Join instead",
  },
  plan: {
    errors: {
      amountEvery30Days: "Choose $1 to $500 USDC every 30 days.",
      amountYearly: "Choose $10 to $5,000 USDC a year.",
      verifySeller: "Verify to sell.",
    },
  },
} as const;
