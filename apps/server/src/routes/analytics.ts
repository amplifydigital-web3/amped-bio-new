import express, { Router } from "express";
import { analyticsCollectSchema } from "@repo/constants";
import { collectAnalyticsEvent } from "../services/analytics/collector";
import { resolveLocation } from "../services/analytics/geo";
import { getVisitorIp } from "../services/analytics/visitorIp";

const analyticsRouter: Router = Router();

/**
 * POST /api/analytics/collect
 *
 * Receives page view, link click and engagement events from public profile
 * pages. The body is JSON sent as text/plain so browsers can use
 * navigator.sendBeacon without a CORS preflight. Always answers 204 so
 * tracking failures never affect the visitor.
 */
analyticsRouter.post("/collect", express.text({ type: "*/*", limit: "4kb" }), async (req, res) => {
  try {
    const raw = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const parsed = analyticsCollectSchema.safeParse(raw);
    if (parsed.success) {
      await collectAnalyticsEvent(req, parsed.data);
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      console.error("[ANALYTICS] failed to collect event", error);
    }
  }
  res.status(204).end();
});

/**
 * GET /api/analytics/geo-check
 *
 * Shows what location analytics would record for the caller, so the proxy
 * setup can be checked after a deploy. Open it from a phone on mobile data or
 * a VPN: the country and city should match. Returns no IP address and stores
 * nothing.
 */
analyticsRouter.get("/geo-check", async (req, res) => {
  const { ip, viaCloudflare } = getVisitorIp(req);
  const location = await resolveLocation(req, ip, viaCloudflare);
  res.set("Cache-Control", "no-store");
  res.json({
    country: location.country,
    city: location.city,
    source: location.source,
    viaCloudflare,
    visitorIpFound: ip !== "",
    ipVersion: ip ? (ip.includes(":") ? 6 : 4) : null,
  });
});

export default analyticsRouter;
