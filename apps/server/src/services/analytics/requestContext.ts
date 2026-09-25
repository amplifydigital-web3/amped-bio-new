import { createHash, createHmac } from "node:crypto";
import type { Request } from "express";
import type { AnalyticsSource } from "@repo/constants";
import { env } from "../../env";

/**
 * Helpers that turn an incoming tracking request into anonymous, aggregate-ready
 * attributes. Raw IP addresses and full user agents are used transiently to
 * derive coarse attributes and a daily visitor hash, and are never persisted.
 */

const BOT_PATTERN =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora link|outbrain|pinterest\/|vkshare|w3c_validator|whatsapp|telegrambot|discordbot|headless|lighthouse|pagespeed|curl|wget|python-requests|axios|node-fetch|go-http-client|okhttp|java\//i;

export function isBot(userAgent: string): boolean {
  return !userAgent || BOT_PATTERN.test(userAgent);
}

export function getClientIp(req: Request): string {
  const header = (name: string) => {
    const value = req.headers[name];
    return Array.isArray(value) ? value[0] : value;
  };

  const forwarded = header("cf-connecting-ip") || header("x-real-ip") || header("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "";
}

/**
 * Daily rotating visitor hash. The salt changes every UTC day and includes the
 * page owner, so the same person cannot be linked across days or creators.
 */
export function getVisitorHash(userId: number, ip: string, userAgent: string, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const secret = env.ANALYTICS_SALT_SECRET || env.BETTER_AUTH_SECRET;
  return createHash("sha256")
    .update(`${day}|${secret}|${userId}|${ip}|${userAgent}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Keyed hash of the long-lived browser ID a visitor gets after opting in to
 * analytics. Scoped to one creator, so the same browser produces unrelated
 * values on different creators' pages. The raw ID is never stored.
 */
export function getPersistentVisitorHash(userId: number, pvid: string) {
  const secret = env.ANALYTICS_SALT_SECRET || env.BETTER_AUTH_SECRET;
  return createHmac("sha256", secret).update(`pv|${userId}|${pvid}`).digest("hex").slice(0, 32);
}

/** Reads the numeric campaign ID that tagged links carry as utm_id. */
export function getCampaignIdFromUrl(pageUrl?: string): number | null {
  if (!pageUrl) return null;
  try {
    const value = new URL(pageUrl).searchParams.get("utm_id");
    const id = value && /^\d{1,9}$/.test(value) ? Number(value) : null;
    return id && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export type ParsedUserAgent = {
  device: "mobile" | "tablet" | "desktop";
  os: string | null;
  browser: string | null;
};

export function parseUserAgent(userAgent: string): ParsedUserAgent {
  const ua = userAgent || "";

  let device: ParsedUserAgent["device"] = "desktop";
  if (/iPad|Tablet|PlayBook|Silk|Kindle|(Android(?!.*Mobile))/i.test(ua)) {
    device = "tablet";
  } else if (/Mobi|iPhone|iPod|Android|Windows Phone|IEMobile|Opera Mini/i.test(ua)) {
    device = "mobile";
  }

  let os: string | null = null;
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/CrOS/i.test(ua)) os = "ChromeOS";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  // In-app browsers first: they matter most for link-in-bio traffic
  let browser: string | null = null;
  if (/Instagram/i.test(ua)) browser = "Instagram in-app";
  else if (/musical_ly|TikTok|BytedanceWebview/i.test(ua)) browser = "TikTok in-app";
  else if (/FBAN|FBAV|FB_IAB/i.test(ua)) browser = "Facebook in-app";
  else if (/Snapchat/i.test(ua)) browser = "Snapchat in-app";
  else if (/LinkedInApp/i.test(ua)) browser = "LinkedIn in-app";
  else if (/Twitter/i.test(ua)) browser = "X in-app";
  else if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/SamsungBrowser/i.test(ua)) browser = "Samsung Internet";
  else if (/Firefox|FxiOS/i.test(ua)) browser = "Firefox";
  else if (/Chrome|CriOS/i.test(ua)) browser = "Chrome";
  else if (/Safari/i.test(ua)) browser = "Safari";

  return { device, os, browser };
}

const SOURCE_RULES: Array<[RegExp, AnalyticsSource]> = [
  [/(^|\.)(instagram\.com|l\.instagram\.com|ig\.me)$/i, "Instagram"],
  [/(^|\.)(tiktok\.com|tiktokv\.com)$/i, "TikTok"],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/i, "X"],
  [
    /(^|\.)(facebook\.com|fb\.com|fb\.me|m\.facebook\.com|l\.facebook\.com|lm\.facebook\.com)$/i,
    "Facebook",
  ],
  [/(^|\.)(youtube\.com|youtu\.be)$/i, "YouTube"],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/i, "LinkedIn"],
  [/(^|\.)threads\.net$/i, "Threads"],
  [/(^|\.)snapchat\.com$/i, "Snapchat"],
  [/(^|\.)(pinterest\.[a-z.]+|pin\.it)$/i, "Pinterest"],
  [/(^|\.)reddit\.com$/i, "Reddit"],
  [/(^|\.)(t\.me|telegram\.org|web\.telegram\.org)$/i, "Telegram"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/i, "WhatsApp"],
  [/(^|\.)(discord\.com|discord\.gg|discordapp\.com)$/i, "Discord"],
  [/(^|\.)twitch\.tv$/i, "Twitch"],
  [/(^|\.)(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|mail\.yahoo\.com)$/i, "Email"],
  [/(^|\.)google\.[a-z.]+$/i, "Google"],
  [/(^|\.)bing\.com$/i, "Bing"],
  [
    /(^|\.)(duckduckgo\.com|yahoo\.com|yandex\.[a-z]+|baidu\.com|ecosia\.org|search\.brave\.com)$/i,
    "Other search",
  ],
  [/(^|\.)amped\.bio$/i, "Amped Bio"],
];

const UTM_SOURCE_RULES: Array<[RegExp, AnalyticsSource]> = [
  [/^qr$/i, "QR code"],
  [/^(ig|instagram)$/i, "Instagram"],
  [/^(tt|tiktok)$/i, "TikTok"],
  [/^(x|twitter)$/i, "X"],
  [/^(fb|facebook)$/i, "Facebook"],
  [/^(yt|youtube)$/i, "YouTube"],
  [/^linkedin$/i, "LinkedIn"],
  [/^threads$/i, "Threads"],
  [/^snapchat$/i, "Snapchat"],
  [/^pinterest$/i, "Pinterest"],
  [/^reddit$/i, "Reddit"],
  [/^telegram$/i, "Telegram"],
  [/^whatsapp$/i, "WhatsApp"],
  [/^discord$/i, "Discord"],
  [/^twitch$/i, "Twitch"],
  [/^(email|newsletter)$/i, "Email"],
];

export type TrafficAttribution = {
  source: AnalyticsSource;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

function safeUrl(value?: string): URL | null {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function trimParam(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase().slice(0, 100);
  return trimmed || null;
}

/**
 * Classifies where a visit came from. Incoming UTM parameters win over the
 * referrer because in-app browsers (Instagram, TikTok) often strip referrers.
 */
export function getTrafficAttribution(referrer?: string, pageUrl?: string): TrafficAttribution {
  const page = safeUrl(pageUrl);
  const utmSource = trimParam(page?.searchParams.get("utm_source") ?? null);
  const utmMedium = trimParam(page?.searchParams.get("utm_medium") ?? null);
  const utmCampaign = trimParam(page?.searchParams.get("utm_campaign") ?? null);

  const ref = safeUrl(referrer);
  const refHost = ref ? ref.hostname.replace(/^www\./i, "").toLowerCase() : null;
  // Internal navigation on the same host is not a referral
  const referrerHost =
    refHost && page && refHost === page.hostname.replace(/^www\./i, "") ? null : refHost;

  let source: AnalyticsSource = "Direct";

  const utmMatch = utmSource
    ? UTM_SOURCE_RULES.find(([pattern]) => pattern.test(utmSource))
    : undefined;
  if (utmMatch) {
    source = utmMatch[1];
  } else if (referrerHost) {
    const refMatch = SOURCE_RULES.find(([pattern]) => pattern.test(referrerHost));
    source = refMatch ? refMatch[1] : "Other";
  } else if (utmSource) {
    source = "Other";
  }

  return {
    source,
    referrer: referrerHost ? referrerHost.slice(0, 255) : null,
    utmSource,
    utmMedium,
    utmCampaign,
  };
}
