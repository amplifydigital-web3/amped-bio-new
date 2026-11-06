/**
 * Take It Down and copyright notices (adult content review 7.2, 7.3 and 7.5, PR R3).
 * Public forms at amped.bio/takedown and amped.bio/copyright, no account needed.
 */
import { z } from "zod";

const link = z.string().trim().url().max(500);
const name = z.string().trim().min(2).max(160);
const email = z.string().trim().email().max(254);
const phone = z.string().trim().max(32).optional();

/** Take It Down request: the five parts of a valid request under the Act (7.2). */
export const takedownSubmitSchema = z.object({
  links: z.array(link).max(20).default([]),
  /** A creator handle plus a description, when there is no link */
  handle: z.string().trim().max(64).optional(),
  description: z.string().trim().max(2000).optional(),
  goodFaith: z.boolean(),
  detail: z.string().trim().max(4000).optional(),
  relationship: z.enum(["self", "agent"]),
  agentDetail: z.string().trim().max(160).optional(),
  email,
  phone,
  signature: z.string().trim().max(160),
  turnstileToken: z.string().max(4096).optional(),
});
export type TakedownSubmit = z.infer<typeof takedownSubmitSchema>;

/** Copyright notice under 17 U.S.C. 512(c)(3) (7.5). */
export const copyrightSubmitSchema = z.object({
  work: z.string().trim().max(4000),
  workLink: z.string().trim().url().max(500).optional(),
  links: z.array(link).max(20),
  name: z.string().trim().max(160),
  postalAddress: z.string().trim().max(1000),
  email,
  phone,
  goodFaith: z.boolean(),
  accurate: z.boolean(),
  signature: z.string().trim().max(160),
  turnstileToken: z.string().max(4096).optional(),
});
export type CopyrightSubmit = z.infer<typeof copyrightSubmitSchema>;

/** Counter notice under 512(g)(3), from the creator's notice (board ar9). */
export const counterNoticeSchema = z.object({
  number: z.string().regex(/^CN-\d{4}-\d{6}$/),
  mistake: z.boolean(),
  name,
  postalAddress: z.string().trim().min(5).max(1000),
  phone: z.string().trim().min(5).max(32),
  jurisdiction: z.boolean(),
  acceptService: z.boolean(),
  signature: name,
});
export type CounterNotice = z.infer<typeof counterNoticeSchema>;

export const takedownStatusSchema = z.object({
  number: z.string().regex(/^(TD|CN|CC)-\d{4}-\d{6}$/),
  key: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/),
});

/** What a sender sees on the status page. Never the item, the creator or a reviewer. */
export interface TakedownStatus {
  number: string;
  kind: "ncii" | "copyright" | "counter";
  receivedAt: string;
  state: "needs_more" | "received" | "hidden" | "decided";
  outcome: "removed" | "not_valid" | "withdrawn" | null;
  /** Fields still missing, for "We need one more thing" */
  missing: string[];
  restoreFrom: string | null;
  restoreBy: string | null;
}

export const TAKEDOWN_COPY = {
  formTitle: "Report an intimate image shared without consent",
  formIntro:
    "Use this form to ask Amped.Bio to remove an intimate image or video of you that was shared without your consent. We act within 48 hours.",
  where: "Where it is",
  linksHelp: "Paste one or more Amped.Bio links.",
  handleHelp: "No link? Give the creator's handle and describe the item.",
  statement: "I believe in good faith that this was shared without my consent.",
  detail: "Anything else we should know (optional)",
  who: "Who you are",
  self: "I am the person shown",
  agent: "I act for them",
  agentDetail: "Your relationship to them",
  contact: "How we reach you",
  email: "Email",
  phone: "Phone (optional)",
  signature: "Type your full name to sign",
  submit: "Send request",
  sent: (number: string) => `Request ${number} received. We emailed you a link to follow it.`,
  needsMore: "We need one more thing",
  statusTitle: (number: string) => `Request ${number}`,
  states: {
    needs_more: "We need one more thing",
    received: "Received",
    hidden: "Hidden while we check",
    decided: "Decided",
  },
  outcomes: {
    removed: "Removed",
    not_valid: "Not valid",
    withdrawn: "Withdrawn",
  },
  reportCsamThanks: "Thank you. We hid it while we check.",
  copyrightTitle: "Copyright notice",
  copyrightIntro:
    "Use this form if an item on Amped.Bio copies your work. A reviewer decides within 1 business day.",
  work: "What was copied",
  workLink: "Link to the original (optional)",
  name: "Your full name",
  postalAddress: "Postal address",
  goodFaithCopyright:
    "I believe in good faith that this use is not authorized by the copyright owner, its agent or the law.",
  accurate:
    "The information in this notice is accurate, and under penalty of perjury, I am the owner or authorized to act for the owner.",
  counterTitle: "Counter notice",
  counterMistake:
    "Under penalty of perjury, I believe in good faith the item was removed by mistake or misidentification.",
  counterJurisdiction:
    "I consent to the jurisdiction of the federal district court for my address, or any judicial district where Amped.Bio may be found if my address is outside the United States.",
  counterService: "I will accept service of process from the person who sent the notice, or their agent.",
} as const;

/** Copyright counter notice restore window: business days after receipt (512(g)(2)(C)). */
export const COUNTER_RESTORE_FROM_DAYS = 10;
export const COUNTER_RESTORE_BY_DAYS = 14;

/** Abuse guards (7.1, 7.3). */
export const CHILD_REPORT_UNFOUNDED_LIMIT = 3;
export const CHILD_REPORT_UNFOUNDED_DAYS = 30;
export const TAKEDOWN_FLAG_PER_CREATOR = 3;
export const TAKEDOWN_FLAG_WINDOW_HOURS = 24;
