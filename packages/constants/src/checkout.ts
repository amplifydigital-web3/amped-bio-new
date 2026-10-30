/**
 * Checkout intents (Build Board #49 Mobile checkout, PR CK-1; mobile first review R1).
 * One server side intent carries a purchase across sign up, the Wallet Buy USDC
 * handoff, a browser switch and an app reload.
 */
import { z } from "zod";

export const CHECKOUT_KINDS = ["purchase", "membership", "tip", "ticket"] as const;
export type CheckoutKind = (typeof CHECKOUT_KINDS)[number];

/** Kinds that can start an intent today. The rest arrive with memberships, tips and tickets. */
export const LIVE_CHECKOUT_KINDS = ["purchase"] as const;

export const CHECKOUT_STATUSES = [
  "open",
  "awaiting_funds",
  "signing",
  "submitted",
  "paid",
  "expired",
] as const;
export type CheckoutStatus = (typeof CHECKOUT_STATUSES)[number];

/** Statuses the resume bar offers to finish. */
export const RESUMABLE_CHECKOUT_STATUSES = ["open", "awaiting_funds"] as const;

/** What an intent is for. Offers and plans replace content targets with store PR 9. */
export const CHECKOUT_TARGET_TYPES = ["content"] as const;
export type CheckoutTargetType = (typeof CHECKOUT_TARGET_TYPES)[number];

/** Where the fan tapped Buy or Join, for the phone funnel (review section 7). */
export const CHECKOUT_SOURCES = [
  "bio",
  "item_page",
  "store",
  "library",
  "telegram",
  "email",
  "push",
  "other",
] as const;
export type CheckoutSource = (typeof CHECKOUT_SOURCES)[number];

/** An intent lives 24 hours (review R1). */
export const CHECKOUT_INTENT_TTL_MS = 24 * 60 * 60 * 1000;

/** The query parameter every later step carries: sign up, Buy USDC, the handoff, reminders. */
export const CHECKOUT_INTENT_PARAM = "ci";

/** Intent ids are UUID v7, 32 lowercase hex characters. */
export const checkoutIntentIdSchema = z.string().regex(/^[0-9a-f]{32}$/);

/** Promoter codes from ?via= (content spec 3.9). */
export const checkoutViaSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,32}$/);

export const checkoutStartInputSchema = z.object({
  kind: z.enum(CHECKOUT_KINDS),
  target: z.object({
    type: z.enum(CHECKOUT_TARGET_TYPES),
    id: z.string().min(1).max(64),
  }),
  via: checkoutViaSchema.optional(),
  source: z.enum(CHECKOUT_SOURCES).default("other"),
});
export type CheckoutStartInput = z.infer<typeof checkoutStartInputSchema>;

/** The path on the app host where an intent is paid (CK-2 builds the page). */
export function checkoutPayPath(intentId: string): string {
  return `/pay/${intentId}`;
}

/** Resume bar copy. Names the item only to its own signed in fan. */
export function checkoutResumeLabel(title: string): string {
  return `Finish buying ${title}`;
}
