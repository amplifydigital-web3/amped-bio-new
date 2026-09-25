import type { AnalyticsAdContext } from "@repo/constants";
import { env } from "../../env";
import { prisma } from "../DB";
import { decryptSecret } from "./secretBox";

/**
 * Server-side event forwarding to Meta Conversions API and TikTok Events API.
 *
 * Only called for events where the visitor accepted the page owner's pixels
 * (the browser sends an `ad` context only after consent). The same event ID is
 * used by the browser tag, so each platform deduplicates the pair.
 */

type ForwardingConfig = {
  metaPixelId: string | null;
  metaToken: string | null;
  tiktokPixelId: string | null;
  tiktokToken: string | null;
};

const CONFIG_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 5_000;
const configCache = new Map<number, { config: ForwardingConfig | null; expiresAt: number }>();

export function invalidatePixelConfig(userId: number) {
  configCache.delete(userId);
}

async function loadConfig(userId: number): Promise<ForwardingConfig | null> {
  const cached = configCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.config;

  const row = await prisma.trackingPixels.findUnique({ where: { user_id: userId } });
  const config: ForwardingConfig | null = row
    ? {
        metaPixelId: row.meta_pixel_id,
        metaToken: decryptSecret(row.meta_capi_token_enc),
        tiktokPixelId: row.tiktok_pixel_id,
        tiktokToken: decryptSecret(row.tiktok_events_token_enc),
      }
    : null;

  if (configCache.size > 10_000) configCache.clear();
  configCache.set(userId, { config, expiresAt: Date.now() + CONFIG_TTL_MS });
  return config;
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn(
        `[TRACKING] ${new URL(url).hostname} responded ${response.status}`,
        text.slice(0, 300)
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

export type ForwardableEvent = {
  userId: number;
  type: "view" | "click";
  ad: AnalyticsAdContext;
  ip: string;
  userAgent: string;
  pageUrl?: string;
  referrer?: string;
  link?: { id: number; label: string | null; url: string | null };
};

function sendToMeta(config: ForwardingConfig, event: ForwardableEvent, eventTime: number) {
  if (!config.metaPixelId || !config.metaToken) return null;

  const url = `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${config.metaPixelId}/events?access_token=${encodeURIComponent(config.metaToken)}`;

  return postJson(url, {
    data: [
      {
        event_name: event.type === "view" ? "PageView" : "LinkClick",
        event_time: eventTime,
        event_id: event.ad.eventId,
        action_source: "website",
        event_source_url: event.pageUrl,
        user_data: {
          client_ip_address: event.ip || undefined,
          client_user_agent: event.userAgent,
          fbp: event.ad.fbp,
          fbc: event.ad.fbc,
        },
        custom_data: event.link
          ? { content_name: event.link.label ?? undefined, link_url: event.link.url ?? undefined }
          : undefined,
      },
    ],
  });
}

function sendToTikTok(config: ForwardingConfig, event: ForwardableEvent, eventTime: number) {
  if (!config.tiktokPixelId || !config.tiktokToken) return null;

  return postJson(
    "https://business-api.tiktok.com/open_api/v1.3/event/track/",
    {
      event_source: "web",
      event_source_id: config.tiktokPixelId,
      data: [
        {
          event: event.type === "view" ? "ViewContent" : "ClickButton",
          event_time: eventTime,
          event_id: event.ad.eventId,
          user: {
            ip: event.ip || undefined,
            user_agent: event.userAgent,
            ttp: event.ad.ttp,
            ttclid: event.ad.ttclid,
          },
          page: { url: event.pageUrl, referrer: event.referrer },
          properties: event.link
            ? {
                content_name: event.link.label ?? undefined,
                description: event.link.url ?? undefined,
              }
            : undefined,
        },
      ],
    },
    { "Access-Token": config.tiktokToken }
  );
}

/**
 * Sends the event to every server-side destination the page owner configured.
 * Never throws: failures are logged and do not affect first-party analytics.
 */
export async function forwardToAdPlatforms(event: ForwardableEvent): Promise<void> {
  try {
    const config = await loadConfig(event.userId);
    if (!config) return;

    const eventTime = Math.floor(Date.now() / 1000);
    const requests = [sendToMeta(config, event, eventTime), sendToTikTok(config, event, eventTime)];
    await Promise.allSettled(requests.filter(Boolean));
  } catch (error) {
    console.error("[TRACKING] forwarding failed", error);
  }
}
