import { z } from "zod";

/**
 * Store promoters (content PR 12, C12; content spec 3.9 Promoters, decision 20).
 *
 * A creator gives an Amped.Bio account a code with a share of the sale. Store links carry
 * ?via={code}. When the code is active, in scope, not expired and not the buyer's own, the
 * API adds one promoter row to the signed split, so the promoter is paid in the same
 * transaction. The share range comes from the payment settings (promoter_share, 1% to 30%
 * by default). Shares are never pulled back on a refund (decision 25).
 */

export const PROMOTER_CODE_STATUSES = ["active", "paused", "ended"] as const;
export type PromoterCodeStatus = (typeof PROMOTER_CODE_STATUSES)[number];

/** Codes are uppercase letters and digits. Lowercase input is accepted and uppercased. */
export const PROMOTER_CODE_PATTERN = /^[A-Z0-9]{4,16}$/;
export const PROMOTER_CODE_GENERATED_LENGTH = 8;
/** A creator holds at most this many codes that are not ended. */
export const PROMOTER_CODES_MAX = 50;
/** The refund pause looks back this far (content spec 3.9). */
export const PROMOTER_REFUND_WINDOW_DAYS = 30;

/** "all" or Offer and MembershipPlan ids as 32 hex characters. */
export const promoterScopeSchema = z.union([
  z.literal("all"),
  z
    .array(z.string().regex(/^[0-9a-f]{32}$/))
    .min(1, "Choose at least one product.")
    .max(100)
    .transform(ids => [...new Set(ids)]),
]);
export type PromoterScope = z.infer<typeof promoterScopeSchema>;

export const promoterCodeInputSchema = z
  .string()
  .trim()
  .transform(code => code.toUpperCase())
  .pipe(z.string().regex(PROMOTER_CODE_PATTERN, "Use 4 to 16 letters and numbers."));

export const promoterUpsertSchema = z.object({
  /** Hex id of the code to edit; omitted to create one */
  id: z
    .string()
    .regex(/^[0-9a-f]{32}$/)
    .optional(),
  /** The promoter's handle, with or without @. Only read when creating */
  promoterHandle: z.string().trim().min(1).max(64).optional(),
  /** Omitted when creating: the API makes one */
  code: promoterCodeInputSchema.optional(),
  bps: z.number().int().min(1).max(5_000),
  scope: promoterScopeSchema,
  /** ISO date. Null for no end date */
  expiresAt: z.string().datetime().nullable().optional(),
});
export type PromoterUpsertInput = z.infer<typeof promoterUpsertSchema>;

export const promoterSetStatusSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{32}$/),
  status: z.enum(PROMOTER_CODE_STATUSES),
});

/** One code on the creator's Promoters list. Amounts are USDC units as strings. */
export type PromoterCodeRow = {
  id: string;
  code: string;
  promoter: { handle: string; name: string };
  bps: number;
  scope: PromoterScope;
  status: PromoterCodeStatus;
  pausedReason: "creator" | "refunds" | null;
  expiresAt: string | null;
  createdAt: string;
  /** Paid sales and joins through the code, refunds excluded */
  sales: number;
  /** Promoter shares paid through the code */
  promoterEarned: string;
  /** Refunded sales in the last 30 days */
  refunds30d: number;
};

/** One code on the promoter's own list. */
export type PromoterMineRow = {
  id: string;
  code: string;
  creator: { handle: string; name: string };
  bps: number;
  scopeCount: number | "all";
  status: PromoterCodeStatus;
  expiresAt: string | null;
  sales: number;
  earned: string;
};

/** The link a promoter shares: the store with the code. */
export function promoterStoreLink(origin: string, handle: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/${handle}/store?via=${encodeURIComponent(code)}`;
}

export function bpsPercent(bps: number): string {
  const value = bps / 100;
  return `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0+$/, "")}%`;
}

export const PROMOTER_COPY = {
  title: "Promoters",
  intro: "Give an Amped.Bio account a code and a share of each sale it brings.",
  newCode: "New code",
  empty: "No promoter codes yet",
  emptyBody:
    "A promoter shares your store link with their code. They get their share in the same payment.",
  fields: {
    promoter: "Promoter",
    promoterHelp: "Their Amped.Bio handle. They need a wallet to be paid.",
    share: "Share of each sale",
    shareHelp: (min: string, max: string) =>
      `${min} to ${max}. You receive the rest after the Amped.Bio fee.`,
    scope: "Products",
    scopeAll: "Every product and your membership",
    scopeChosen: "Chosen products",
    code: "Code",
    codeHelp: "Leave empty and we make one. 4 to 16 letters and numbers.",
    ends: "End date",
    endsHelp: "Optional. The code stops on this date.",
  },
  ftc: "Promoters must say they are paid when they share your link, for example with #ad. Sharing the code without that breaks the FTC rules and our terms.",
  refundNote:
    "Refunds come from your wallet. A promoter's share is not pulled back. A code with refunds above the limit in 30 days pauses for you to review.",
  rowCount: (left: number) =>
    left === 1
      ? "1 more person can be paid on each sale."
      : `${left} more people can be paid on each sale.`,
  statuses: { active: "Active", paused: "Paused", ended: "Ended" } satisfies Record<
    PromoterCodeStatus,
    string
  >,
  pausedRefunds: "Paused for refunds. Review the sales, then turn it back on.",
  actions: {
    copyLink: "Copy link",
    pause: "Pause",
    resume: "Turn back on",
    end: "End code",
    edit: "Edit",
    save: "Save code",
  },
  endConfirm:
    "End this code? New sales stop paying the promoter. Memberships that already joined keep their share. You can't turn it back on.",
  copied: "Link copied",
  sales: (n: number) => (n === 1 ? "1 sale" : `${n} sales`),
  earned: (amount: string) => `${amount} to the promoter`,
  mine: {
    title: "Codes you promote",
    intro: "Share these links. Say you are paid when you post them.",
    earned: (amount: string) => `${amount} earned`,
  },
  referredBy: (handle: string) => `Referred by @${handle}`,
  errors: {
    promoter_not_found: "No Amped.Bio account has that handle.",
    promoter_self: "You can't be your own promoter.",
    promoter_no_wallet: "This account has no wallet yet, so it can't be paid.",
    code_taken: "That code is in use. Try another.",
    share_range: (min: string, max: string) => `Choose a share from ${min} to ${max}.`,
    creator_floor: "This share would leave you under the creator minimum. Choose a smaller share.",
    scope_not_yours: "Choose products from your own store.",
    too_many: "You have the most codes a store can hold. End one first.",
    ended: "This code has ended. Make a new one.",
    expires_past: "Choose an end date after today.",
  },
  bell: (handle: string) =>
    `@${handle} made you a promoter. See your code in Content, Store, Sales.`,
} as const;
