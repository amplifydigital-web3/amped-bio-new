import { Router, type Request, type Response } from "express";
import { env } from "../env";
import { auth } from "../utils/auth";
import { hitRateLimit } from "../utils/rateLimit";
import { TelegramLinkConflictError, linkTelegram } from "../services/telegram/accounts";
import {
  finishTelegramLink,
  isOidcConfigured,
  takePendingLink,
  type LinkReturn,
} from "../services/telegram/oidc";

/**
 * Messaging on Telegram (Build Board #2), spec 3.4.
 *
 * GET /telegram/oidc/callback
 *
 * Telegram sends the user here after Log In with Telegram. The state binds the
 * callback to the Amped session that started the link: the pending link names
 * a user, and the session cookie on this request must be that same user. On
 * every outcome the user lands back where the link started (Account, Connected
 * apps by default; the creator wizard; a creator's page for the fan link sheet)
 * with a result that surface turns into a message: linked, conflict, declined or
 * error.
 */

export type LinkResult = "linked" | "conflict" | "declined" | "expired" | "error";

export function accountRedirect(result: LinkResult): string {
  const base = env.APP_URL.replace(/\/+$/, "");
  return `${base}/account?open=connected-apps&telegram=${result}`;
}

/** The landing URL for a result. The handle was validated when the link started. */
export function linkRedirect(result: LinkResult, returnTo?: LinkReturn): string {
  if (returnTo?.to === "wizard") {
    return `${env.APP_URL.replace(/\/+$/, "")}/home?wizard=telegram&telegram=${result}`;
  }
  if (returnTo?.to === "fan") {
    const base = env.LANDINGPAGE_URL.replace(/\/+$/, "");
    return `${base}/${encodeURIComponent(returnTo.handle)}?message=1&telegram=${result}`;
  }
  return accountRedirect(result);
}

async function sessionUserId(req: Request): Promise<number | null> {
  try {
    const session = await auth.api.getSession({ headers: req.headers as never });
    const id = session?.user?.id;
    return id ? parseInt(String(id), 10) : null;
  } catch {
    return null;
  }
}

export async function handleTelegramOidcCallback(req: Request, res: Response) {
  if (!isOidcConfigured()) {
    res.status(404).end();
    return;
  }
  const address = req.ip || "unknown";
  if ((await hitRateLimit(`tg-oidc:${address}`, 60)) > 30) {
    res.status(429).end();
    return;
  }

  const query = req.query as Record<string, string | undefined>;
  const state = typeof query.state === "string" ? query.state : null;
  const pending = await takePendingLink(state);
  // The user cancelled on Telegram's page, or Telegram refused
  if (query.error) {
    res.redirect(302, linkRedirect("declined", pending?.returnTo));
    return;
  }
  if (!pending || !state) {
    res.redirect(302, accountRedirect("expired"));
    return;
  }

  const userId = await sessionUserId(req);
  if (userId !== pending.userId) {
    // A callback opened in another browser or after signing out. Never link.
    res.redirect(302, linkRedirect("expired", pending.returnTo));
    return;
  }

  const code = typeof query.code === "string" ? query.code : "";
  if (!code || code.length > 2048) {
    res.redirect(302, linkRedirect("error", pending.returnTo));
    return;
  }

  try {
    const identity = await finishTelegramLink(code, pending);
    await linkTelegram(userId, identity);
    res.redirect(302, linkRedirect("linked", pending.returnTo));
  } catch (error) {
    if (error instanceof TelegramLinkConflictError) {
      res.redirect(302, linkRedirect("conflict", pending.returnTo));
      return;
    }
    console.error("[telegram] OIDC callback failed", error);
    res.redirect(302, linkRedirect("error", pending.returnTo));
  }
}

const telegramOidcRouter: Router = Router();

telegramOidcRouter.get("/oidc/callback", (req, res) => {
  void handleTelegramOidcCallback(req, res).catch(error => {
    console.error("[telegram] OIDC callback crashed", error);
    if (!res.headersSent) res.redirect(302, linkRedirect("error"));
  });
});

export default telegramOidcRouter;
