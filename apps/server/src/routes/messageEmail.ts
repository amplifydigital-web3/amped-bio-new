import { Router, type Response } from "express";
import { env } from "../env";
import { readEmailOffToken, setMessageNotificationPrefs } from "../services/notifications/bell";

/**
 * Turn off Amped Messages reminder emails from the email footer (PR M4, spec 7.4 item 3).
 *
 * GET shows one button; POST turns the emails off. Mail scanners open every link in an
 * email, so a GET that changed the setting would switch people off without their tap.
 * The token is signed per account and never expires.
 */
const messageEmailRouter: Router = Router();

const escape = (text: string) => text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

function page(res: Response, status: number, title: string, body: string) {
  const settings = new URL("/account?open=messages", env.APP_URL).toString();
  res
    .status(status)
    .type("html")
    .set("Cache-Control", "no-store")
    .set("X-Robots-Tag", "noindex")
    // The API CSP blocks styles and forms; this page needs inline styles and a post to itself
    .set(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
    ).send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)} · Amped.Bio</title>
<style>
body{margin:0;background:#f4f3fa;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:#16152b}
main{max-width:480px;margin:55px auto;padding:0 16px}
.card{background:#fff;border:1px solid #e8e5ef;border-radius:13px;padding:32px}
h1{font-size:24px;line-height:31px;margin:0 0 13px}
p{margin:0 0 21px;color:#3a3858}
button{width:100%;min-height:55px;border:0;border-radius:13px;background:#5650a2;color:#fff;font:700 16px system-ui,sans-serif;cursor:pointer}
button:focus-visible{outline:3px solid #16152b;outline-offset:3px}
a{color:#5650a2}
</style></head><body><main><div class="card"><h1>${escape(title)}</h1>${body}
<p style="margin:21px 0 0;font-size:13px">You can change this any time in <a href="${escape(settings)}">Account, Messages</a>.</p>
</div></main></body></html>`);
}

messageEmailRouter.get("/messages-off", (req, res) => {
  const token = typeof req.query.t === "string" ? req.query.t : "";
  if (readEmailOffToken(token) === null) {
    return page(res, 400, "This link is not valid", "<p>Open the link from the email again.</p>");
  }
  return page(
    res,
    200,
    "Turn off message emails?",
    `<p>You will stop getting an email when a message waits unread for 30 minutes. Messages still arrive in your Inbox.</p>
<form method="post" action="messages-off"><input type="hidden" name="t" value="${escape(token)}"><button type="submit">Turn off message emails</button></form>`
  );
});

messageEmailRouter.post("/messages-off", async (req, res) => {
  const token = typeof req.body?.t === "string" ? req.body.t : "";
  const userId = readEmailOffToken(token);
  if (userId === null) {
    return page(res, 400, "This link is not valid", "<p>Open the link from the email again.</p>");
  }
  try {
    await setMessageNotificationPrefs(userId, { email: false });
  } catch (error) {
    console.error("[message-email] turn off failed:", error);
    return page(res, 500, "Something went wrong", "<p>Try again in a minute.</p>");
  }
  return page(res, 200, "Message emails are off", "<p>Messages still arrive in your Inbox.</p>");
});

export default messageEmailRouter;
