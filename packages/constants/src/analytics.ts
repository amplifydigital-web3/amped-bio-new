import { z } from "zod";

/**
 * Creator analytics shared definitions.
 *
 * Privacy model: by default visitors are counted without cookies and without
 * storing IP addresses. The server derives a visitor hash from (daily salt, page
 * owner, IP, user agent) and discards the raw values. The salt rotates every UTC
 * day, so a visitor cannot be followed across days or across creator pages.
 *
 * Only when a visitor opts in to analytics does the page keep a long-lived
 * random ID, which the server stores as a keyed hash scoped to one creator. That
 * enables returning-visitor and retention reporting for consenting visitors.
 */

export const ANALYTICS_EVENT_TYPES = ["view", "click", "engage", "consent"] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

// Present only after the visitor accepted the page owner's tracking pixels.
// Used to forward the same event server side (Meta Conversions API, TikTok
// Events API) with an event ID the browser tag also uses, so platforms dedupe.
export const analyticsAdContextSchema = z.object({
  eventId: z.string().min(8).max(64),
  fbp: z.string().max(255).optional(),
  fbc: z.string().max(255).optional(),
  ttp: z.string().max(255).optional(),
  ttclid: z.string().max(255).optional(),
});

export type AnalyticsAdContext = z.infer<typeof analyticsAdContextSchema>;

// Identifiers attached to every first-party event
const eventIdentity = {
  userId: z.number().int().positive(),
  // Client generated UUID; the server stores each ID once, so retries are dropped
  eventId: z.string().min(8).max(64).optional(),
  // Per page load, or per browser tab session when the visitor allowed analytics
  sessionId: z.string().min(8).max(64).optional(),
  // Long-lived browser ID. Sent only when the visitor allowed analytics.
  pvid: z.string().uuid().optional(),
  // The visitor's analytics choice at the time of the event
  analyticsConsent: z.boolean().optional(),
};

// Payload sent by public profile pages to the collect endpoint
export const analyticsCollectSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("view"),
    ...eventIdentity,
    referrer: z.string().max(2048).optional(),
    url: z.string().max(2048).optional(),
    ad: analyticsAdContextSchema.optional(),
    // Consent was given after the first-party view was recorded: forward to
    // ad platforms only, without counting a second view
    adOnly: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("click"),
    ...eventIdentity,
    blockId: z.number().int().positive(),
    referrer: z.string().max(2048).optional(),
    url: z.string().max(2048).optional(),
    ad: analyticsAdContextSchema.optional(),
  }),
  z.object({
    type: z.literal("engage"),
    ...eventIdentity,
    // Visible time on page in milliseconds, capped to 30 minutes
    durationMs: z
      .number()
      .int()
      .min(0)
      .max(30 * 60 * 1000),
  }),
  z.object({
    // A consent decision, recorded as proof of consent
    type: z.literal("consent"),
    ...eventIdentity,
    analytics: z.boolean(),
    advertising: z.boolean(),
    policyVersion: z.string().max(16),
    source: z.enum(["banner", "settings", "gpc"]),
  }),
]);

export type AnalyticsCollectPayload = z.infer<typeof analyticsCollectSchema>;

// Normalized traffic source buckets
export const ANALYTICS_SOURCES = [
  "Direct",
  "QR code",
  "Instagram",
  "TikTok",
  "X",
  "Facebook",
  "YouTube",
  "LinkedIn",
  "Threads",
  "Snapchat",
  "Pinterest",
  "Reddit",
  "Telegram",
  "WhatsApp",
  "Discord",
  "Twitch",
  "Email",
  "Google",
  "Bing",
  "Other search",
  "Amped Bio",
  "Other",
] as const;
export type AnalyticsSource = (typeof ANALYTICS_SOURCES)[number];

export const ANALYTICS_RANGE_PRESETS = ["24h", "7d", "28d", "90d", "365d", "all"] as const;
export type AnalyticsRangePreset = (typeof ANALYTICS_RANGE_PRESETS)[number];

export const ANALYTICS_BREAKDOWN_DIMENSIONS = [
  "source",
  "referrer",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "country",
  "city",
  "device",
  "os",
  "browser",
] as const;
export type AnalyticsBreakdownDimension = (typeof ANALYTICS_BREAKDOWN_DIMENSIONS)[number];

export const analyticsRangeSchema = z.object({
  range: z.enum(ANALYTICS_RANGE_PRESETS).default("28d"),
  // Minutes to add to UTC to get the viewer's local time (e.g. -240 for EDT)
  tzOffsetMinutes: z
    .number()
    .int()
    .min(-14 * 60)
    .max(14 * 60)
    .default(0),
  // Restrict results to a single link block
  blockId: z.number().int().positive().optional(),
});

export type AnalyticsRangeInput = z.infer<typeof analyticsRangeSchema>;

export const analyticsBreakdownSchema = analyticsRangeSchema.extend({
  dimension: z.enum(ANALYTICS_BREAKDOWN_DIMENSIONS),
  limit: z.number().int().min(1).max(100).default(10),
});

// Query parameter appended to QR codes so scans are attributed separately
export const ANALYTICS_QR_PARAM = "utm_source=qr";

// ---------------------------------------------------------------------------
// Third-party tracking pixels (Google Analytics 4, Meta, TikTok)
// ---------------------------------------------------------------------------

export const GA4_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;
export const META_PIXEL_ID_PATTERN = /^\d{10,20}$/;
export const TIKTOK_PIXEL_ID_PATTERN = /^[A-Z0-9]{15,25}$/;

const optionalId = (pattern: RegExp, message: string) =>
  z
    .string()
    .trim()
    .transform(value => value.toUpperCase())
    .refine(value => value === "" || pattern.test(value), { message })
    .nullable()
    .optional();

export const trackingPixelsUpdateSchema = z.object({
  ga4MeasurementId: optionalId(
    GA4_MEASUREMENT_ID_PATTERN,
    "Use a GA4 Measurement ID like G-XXXXXXXXXX"
  ),
  metaPixelId: optionalId(META_PIXEL_ID_PATTERN, "Meta Pixel IDs are 10 to 20 digits"),
  tiktokPixelId: optionalId(
    TIKTOK_PIXEL_ID_PATTERN,
    "TikTok Pixel IDs are 15 to 25 letters and digits"
  ),
  // Tokens: undefined keeps the stored value, "" removes it, a value replaces it
  metaCapiToken: z.string().trim().max(1024).optional(),
  tiktokEventsToken: z.string().trim().max(1024).optional(),
});

export type TrackingPixelsUpdate = z.infer<typeof trackingPixelsUpdateSchema>;

// Public, non-secret pixel IDs rendered on a creator's page
export type PublicTrackingPixels = {
  ga4MeasurementId: string | null;
  metaPixelId: string | null;
  tiktokPixelId: string | null;
};

// ---------------------------------------------------------------------------
// Visitor consent
// ---------------------------------------------------------------------------

// Bump when the notice changes materially, so visitors are asked again
export const CONSENT_POLICY_VERSION = "2026-09";
// Stores the visitor's choices: { v, analytics, ads: { [creatorId]: boolean }, at }
export const CONSENT_STORAGE_KEY = "amped_consent_v2";
// Long-lived visitor ID, created only after analytics consent
export const PERSISTENT_VISITOR_STORAGE_KEY = "amped_vid";
// Maximum lifetime of the visitor ID and of a consent decision (13 months)
export const CONSENT_MAX_AGE_MS = 395 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export const CAMPAIGN_CHANNELS = [
  "instagram",
  "tiktok",
  "x",
  "youtube",
  "linkedin",
  "threads",
  "facebook",
  "newsletter",
  "qr",
  "other",
] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

export const analyticsCampaignCreateSchema = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters").max(80),
  channel: z.enum(CAMPAIGN_CHANNELS),
});

export const analyticsCampaignIdSchema = z.object({ id: z.number().int().positive() });
