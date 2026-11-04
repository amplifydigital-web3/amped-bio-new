import type { Request } from "express";
import { getClientIp } from "../analytics/requestContext";
import type { Viewer } from "./types";

type ViewerCtx = { user?: { sub: number; wallet?: string | null } | null; req: Request };

/** The viewer is always the session account, never client input. */
export function viewerFrom(ctx: ViewerCtx): Viewer {
  return {
    userId: ctx.user?.sub ?? null,
    wallet: ctx.user?.wallet ?? null,
    request: {
      ip: getClientIp(ctx.req),
      userAgent: String(ctx.req.headers["user-agent"] ?? ""),
    },
  };
}
