import express, { Router } from "express";
import { analyticsCollectSchema } from "@repo/constants";
import { collectAnalyticsEvent } from "../services/analytics/collector";

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

export default analyticsRouter;
