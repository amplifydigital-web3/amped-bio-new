import { Router, type Request, type Response } from "express";
import { prisma } from "@repo/database";
import { safeHref } from "@repo/constants";
import { env } from "../env";
import { auth } from "../utils/auth";
import { hitRateLimit } from "../utils/rateLimit";
import { getClientIp } from "../services/analytics/requestContext";
import { isFeatureOn } from "../services/featureFlags";
import { open, type Viewer } from "../services/access";
import type { EnrichedSessionUser } from "../types/auth-helpers";

/**
 * GET /go/:blockId (access gating G3, spec 3.7). A gated link on a public
 * page points here, never at its destination. The session cookie names the
 * viewer; open() checks fresh and only on a pass is the destination read and
 * the browser redirected to it. A refusal sends the viewer back to the
 * creator's page with ?unlock=<blockId>, where the unlock sheet explains the
 * next step. 60 a minute per viewer.
 */

export const GO_PER_MINUTE = 60;

async function viewerFor(req: Request): Promise<Viewer> {
  let userId: number | null = null;
  let wallet: string | null = null;
  try {
    const session = await auth.api.getSession({ headers: req.headers as never });
    if (session?.user) {
      const user = session.user as unknown as EnrichedSessionUser;
      userId = parseInt(user.id, 10);
      wallet = user.wallet ?? null;
    }
  } catch {
    // A broken session reads as signed out: the rule decides
  }
  return {
    userId,
    wallet,
    request: { ip: getClientIp(req), userAgent: String(req.headers["user-agent"] ?? "") },
  };
}

const landing = () => env.LANDINGPAGE_URL.replace(/\/+$/, "");

export async function handleGo(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  const raw = String(req.params.blockId ?? "");
  if (!isFeatureOn("accessGating") || !/^\d{1,10}$/.test(raw)) {
    res.status(404).type("text/plain").send("Not found");
    return;
  }
  const blockId = Number(raw);
  const viewer = await viewerFor(req);
  const key = viewer.userId !== null ? `u:${viewer.userId}` : `ip:${viewer.request!.ip}`;
  if ((await hitRateLimit(`access_go:${key}`, 60)) > GO_PER_MINUTE) {
    res.status(429).type("text/plain").send("Too many requests. Try again in a minute.");
    return;
  }

  const { decision, value } = await open(viewer, { type: "block", id: raw }, async () => {
    const row = await prisma.block.findUnique({
      where: { id: blockId },
      select: { type: true, config: true },
    });
    if (row?.type !== "link") return null;
    const url = (row.config as { url?: unknown } | null)?.url;
    return typeof url === "string" ? (safeHref(url) ?? null) : null;
  });

  if (decision.allowed && value) {
    // A creator opening their own link is not a visitor click
    await prisma.block
      .updateMany({
        where: { id: blockId, ...(viewer.userId ? { user_id: { not: viewer.userId } } : {}) },
        data: { clicks: { increment: 1 } },
      })
      .catch(() => undefined);
    res.redirect(302, value);
    return;
  }
  if (decision.reason === "not_found" || decision.allowed) {
    res.status(404).type("text/plain").send("Not found");
    return;
  }
  const owner = await prisma.block.findUnique({
    where: { id: blockId },
    select: { user: { select: { handle: true } } },
  });
  const handle = owner?.user.handle;
  if (!handle) {
    res.status(404).type("text/plain").send("Not found");
    return;
  }
  res.redirect(302, `${landing()}/${encodeURIComponent(handle.toLowerCase())}?unlock=${blockId}`);
}

export const goRouter = Router();
goRouter.get("/:blockId", (req, res, next) => {
  handleGo(req, res).catch(next);
});
