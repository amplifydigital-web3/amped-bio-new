/**
 * Creator 18+ setup, people who appear and releases (adult content review 5.1 to 5.3,
 * store policy spec 4.0 to 4.3, PR R4).
 */
import { z } from "zod";
import { contentPublicIdSchema } from "./content";

/** Surfaces a release may allow (store policy spec 4.1). "content" is the item itself. */
export const RELEASE_SURFACES = ["store", "memberships", "paid_messages", "broadcast", "live"] as const;
export type ReleaseSurfaceOption = (typeof RELEASE_SURFACES)[number];

export const RELEASE_SURFACE_LABELS: Record<ReleaseSurfaceOption, string> = {
  store: "Store (one time purchase)",
  memberships: "Memberships",
  paid_messages: "Paid messages",
  broadcast: "Broadcast",
  live: "Live stream",
};

export const releaseOptionsSchema = z.object({
  surfaces: z.array(z.enum(RELEASE_SURFACES)).max(RELEASE_SURFACES.length),
  otherPlatforms: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("none") }),
    z.object({ kind: z.literal("also"), text: z.string().trim().min(2).max(200) }),
  ]),
  faceShown: z.boolean(),
  tagAllowed: z.boolean(),
  payment: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("none") }),
    z.object({ kind: z.literal("fixed"), amountUsd: z.number().positive().max(1_000_000) }),
    // Basis points of the creator's share
    z.object({ kind: z.literal("share"), bps: z.number().int().min(1).max(10_000) }),
  ]),
});
export type ReleaseOptions = z.infer<typeof releaseOptionsSchema>;

/** Release status words (store policy spec). */
export const RELEASE_STATUSES = ["ready", "waiting_to_sign", "waiting_for_you", "withdrawn"] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];
export const RELEASE_STATUS_LABELS: Record<ReleaseStatus, string> = {
  ready: "Ready",
  waiting_to_sign: "Waiting to sign",
  waiting_for_you: "Waiting for you",
  withdrawn: "Withdrawn",
};

/** Invite links: app.amped.bio/appear/{token}, single use, 14 days (5.2 step 1). */
export const APPEAR_INVITE_DAYS = 14;
export const appearTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,64}$/);

export const custodianSchema = z.object({
  name: z.string().trim().min(2).max(160),
  address: z.string().trim().min(5).max(1000),
});

export const appearSignSchema = z.object({
  token: appearTokenSchema,
  options: releaseOptionsSchema,
  legalName: z.string().trim().min(2).max(160),
  idGiven: z.literal(true),
  consent: z.literal(true),
  /** The release was scrolled to the end before Sign enabled */
  readToEnd: z.literal(true),
});

/** The item editor 18+ section (5.3). */
export const contentPeopleSchema = z.object({
  publicId: contentPublicIdSchema,
  /** Empty: only me */
  people: z
    .array(
      z.object({
        personId: z.string().regex(/^[0-9a-f]{32}$/),
        productionDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(60),
      })
    )
    .max(20),
  aiLabel: z.boolean(),
  confirmed: z.literal(true),
});

/** Why submit for review was refused (5.2, 5.3). */
export const ADULT_SUBMIT_ERRORS = {
  adult_off: "Turn on 18+ in Adult content first.",
  not_labeled: "Turn on the 18+ label for this item.",
  ai_label_missing: "Answer Made or changed with AI.",
  confirmation_missing: "Confirm everyone in this item is 18 or older and agreed.",
  release_missing: "Everyone you tag needs a release signed by both of you.",
  production_dates_missing: "Add every date the item was recorded.",
  policy_outdated: "Accept the current Adult Content Policy first.",
} as const;
export type AdultSubmitError = keyof typeof ADULT_SUBMIT_ERRORS;

export const ADULT_SETUP_COPY = {
  title: "Adult content",
  intro: "18+ items open only to fans who passed the Over 18 check. Every step below must pass.",
  over18: "Over 18",
  seller: "Seller verified",
  policy: (version: string) => `Adult Content Policy. Version ${version}, 3 Nov 2026`,
  custodian:
    "Custodian of records. Who keeps the records for everyone in your 18+ items. Private: Amped gives it only on a lawful request.",
  people:
    "People who appear. Everyone in an 18+ item, other than you, must be on your list with a release you both signed.",
  turnOn: "Turn on 18+",
  turnOff: "Turn off 18+",
  turnOffHelp: "Turning 18+ off makes every 18+ item a draft again. Records are kept.",
  addPerson: "Add a person",
  countersign: "Countersign",
  inviteCopied: "Invite link copied. It works once, for 14 days.",
  withdraw: "Withdraw consent",
  confirmation:
    "Everyone in this item is 18 or older, agreed to be filmed and agreed to it being shared here.",
  aiLabel: "Made or changed with AI",
  submit: "Submit for review",
  inReview: "A reviewer checks 18+ items before fans can open them. Usually within 1 business day.",
} as const;
