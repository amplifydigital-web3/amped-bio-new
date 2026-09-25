import type { Request } from "express";
import type { AnalyticsCollectPayload } from "@repo/constants";
import { Prisma } from "../../lib/prisma/index.js";
import { prisma } from "../DB";
import { auth } from "../../utils/auth";
import { resolveLocation } from "./geo";
import { forwardToAdPlatforms } from "./pixelForwarding";
import {
  getCampaignIdFromUrl,
  getClientIp,
  getPersistentVisitorHash,
  getTrafficAttribution,
  getVisitorHash,
  isBot,
  parseUserAgent,
} from "./requestContext";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_EVENTS = 60;
const OWNERSHIP_CACHE_TTL_MS = 5 * 60_000;
const MAX_CACHE_ENTRIES = 50_000;

// Per-process limits keep a single client from flooding the events table.
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
// Caches "user:id", "block:userId:blockId" and "campaign:userId:campaignId" checks
const ownershipCache = new Map<string, { valid: boolean; expiresAt: number }>();

function isRateLimited(key: string, now: number): boolean {
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (rateLimitBuckets.size > MAX_CACHE_ENTRIES) rateLimitBuckets.clear();
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX_EVENTS;
}

async function cachedCheck(key: string, now: number, check: () => Promise<boolean>) {
  const cached = ownershipCache.get(key);
  if (cached && cached.expiresAt > now) return cached.valid;
  const valid = await check();
  if (ownershipCache.size > MAX_CACHE_ENTRIES) ownershipCache.clear();
  ownershipCache.set(key, { valid, expiresAt: now + OWNERSHIP_CACHE_TTL_MS });
  return valid;
}

function isValidTarget(userId: number, blockId: number | undefined, now: number) {
  if (blockId) {
    return cachedCheck(`block:${userId}:${blockId}`, now, async () => {
      const block = await prisma.block.findUnique({
        where: { id: blockId },
        select: { user_id: true },
      });
      return block?.user_id === userId;
    });
  }
  return cachedCheck(`user:${userId}`, now, async () => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    return !!user;
  });
}

async function resolveCampaignId(userId: number, pageUrl: string | undefined, now: number) {
  const campaignId = getCampaignIdFromUrl(pageUrl);
  if (!campaignId) return null;
  const owned = await cachedCheck(`campaign:${userId}:${campaignId}`, now, async () => {
    const campaign = await prisma.analyticsCampaign.findUnique({
      where: { id: campaignId },
      select: { user_id: true },
    });
    return campaign?.user_id === userId;
  });
  return owned ? campaignId : null;
}

/**
 * The visitor's own Amped account, read from their login cookie. Used only when
 * the visitor allowed analytics, and never trusted from the request body.
 */
async function resolveVisitorAccount(req: Request, creatorId: number): Promise<number | null> {
  try {
    const session = await auth.api.getSession({ headers: req.headers as never });
    const id = session?.user ? parseInt(session.user.id, 10) : NaN;
    return Number.isFinite(id) && id !== creatorId ? id : null;
  } catch {
    return null;
  }
}

function isDuplicateEvent(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export type CollectResult = "stored" | "ignored" | "duplicate";

/**
 * Validates and stores one analytics event. Invalid, bot, duplicate or rate
 * limited traffic is dropped silently so public pages never surface tracking
 * errors.
 */
export async function collectAnalyticsEvent(
  req: Request,
  payload: AnalyticsCollectPayload
): Promise<CollectResult> {
  const userAgent = (req.headers["user-agent"] ?? "").slice(0, 512);
  if (isBot(userAgent)) return "ignored";

  const now = Date.now();
  const ip = getClientIp(req);
  if (isRateLimited(ip || userAgent, now)) return "ignored";

  const blockId = payload.type === "click" ? payload.blockId : undefined;
  if (!(await isValidTarget(payload.userId, blockId, now))) return "ignored";

  const visitorHash = getVisitorHash(payload.userId, ip, userAgent);
  const consented = payload.analyticsConsent === true;
  const persistentVisitor =
    consented && payload.pvid ? getPersistentVisitorHash(payload.userId, payload.pvid) : null;

  if (payload.type === "consent") {
    await prisma.analyticsConsent.create({
      data: {
        user_id: payload.userId,
        visitor_hash: visitorHash,
        persistent_visitor:
          payload.analytics && payload.pvid
            ? getPersistentVisitorHash(payload.userId, payload.pvid)
            : null,
        analytics: payload.analytics,
        advertising: payload.advertising,
        policy_version: payload.policyVersion,
        source: payload.source,
      },
    });
    return "stored";
  }

  const { device, os, browser } = parseUserAgent(userAgent);
  const identity = {
    event_id: payload.eventId ?? null,
    user_id: payload.userId,
    visitor_hash: visitorHash,
    persistent_visitor: persistentVisitor,
    session_id: payload.sessionId ?? null,
    device,
    os,
    browser,
  };

  if (payload.type === "engage") {
    try {
      await prisma.analyticsEvent.create({
        data: { ...identity, type: "engage", duration_ms: payload.durationMs, source: "Direct" },
      });
    } catch (error) {
      if (isDuplicateEvent(error)) return "duplicate";
      throw error;
    }
    return "stored";
  }

  if (payload.type === "view" && payload.adOnly) {
    if (payload.ad) {
      void forwardToAdPlatforms({
        userId: payload.userId,
        type: "view",
        ad: payload.ad,
        ip,
        userAgent,
        pageUrl: payload.url,
        referrer: payload.referrer,
      });
    }
    return "ignored";
  }

  const [location, campaignId, visitorUserId] = await Promise.all([
    resolveLocation(req, ip),
    resolveCampaignId(payload.userId, payload.url, now),
    consented ? resolveVisitorAccount(req, payload.userId) : Promise.resolve(null),
  ]);
  const attribution = getTrafficAttribution(payload.referrer, payload.url);

  try {
    await prisma.analyticsEvent.create({
      data: {
        ...identity,
        block_id: blockId ?? null,
        campaign_id: campaignId,
        visitor_user_id: visitorUserId,
        type: payload.type,
        source: attribution.source,
        referrer: attribution.referrer,
        utm_source: attribution.utmSource,
        utm_medium: attribution.utmMedium,
        utm_campaign: attribution.utmCampaign,
        country: location.country,
        city: location.city,
      },
    });
  } catch (error) {
    // A retried delivery of an event already stored
    if (isDuplicateEvent(error)) return "duplicate";
    throw error;
  }

  // Keep the legacy lifetime counter used by the admin dashboard in sync
  let link: { id: number; label: string | null; url: string | null } | undefined;
  if (payload.type === "click" && blockId) {
    const block = await prisma.block.update({
      where: { id: blockId },
      data: { clicks: { increment: 1 } },
      select: { id: true, config: true },
    });
    const config = (block.config ?? {}) as { label?: string; url?: string };
    link = { id: block.id, label: config.label ?? null, url: config.url ?? null };
  }

  // Server-side copy for the owner's ad platforms, only after visitor consent
  if (payload.ad) {
    void forwardToAdPlatforms({
      userId: payload.userId,
      type: payload.type,
      ad: payload.ad,
      ip,
      userAgent,
      pageUrl: payload.url,
      referrer: payload.referrer,
      link,
    });
  }

  return "stored";
}
