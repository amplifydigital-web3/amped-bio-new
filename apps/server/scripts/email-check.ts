/**
 * SMTP check for the verification email path (Email verification QA, 2026-10-10).
 *
 * Reads the same env the server uses, confirms the SMTP relay accepts the
 * credentials, and optionally sends one real verification email through it.
 * On staging and production the relay is SMTP2GO, so this is the way to prove
 * that the SMTP2GO user, password, port and sender are right end to end.
 *
 *   pnpm run --filter server email:check                 connection and login only
 *   pnpm run --filter server email:check you@amped.bio   also sends a verification email
 *   add --force to send on production, where an accident would be costly
 *
 * The sent email carries a dummy token. Opening its link shows the landing
 * page's "This link does not work" card, which proves the link lands on the
 * right host and page. A real token comes from sign up or Resend.
 */
import "dotenv/config";
import { env } from "../src/env";
import { sendEmailVerification, verifySmtpTransport } from "../src/utils/email/email";
import { activeTransport, senderAddress } from "../src/utils/email/transport";

async function main() {
  console.log("Email settings in use:", {
    transport: activeTransport(),
    apiUrl: activeTransport() === "smtp2go-api" ? env.SMTP2GO_API_URL : undefined,
    apiKey: activeTransport() === "smtp2go-api" ? (env.SMTP2GO_API_KEY ? "set" : "missing") : undefined,
    host: activeTransport() === "smtp" ? env.SMTP_HOST : undefined,
    port: activeTransport() === "smtp" ? env.SMTP_PORT : undefined,
    secure: activeTransport() === "smtp" ? env.SMTP_SECURE : undefined,
    user: activeTransport() === "smtp" ? env.SMTP_USER || "(none)" : undefined,
    from: senderAddress(),
    linksGoTo: env.LANDINGPAGE_URL,
  });

  const ready = await verifySmtpTransport();
  if (!ready) {
    console.error(
      "Fix SMTP2GO_API_KEY (API) or SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER and SMTP_PASSWORD (SMTP), then run again."
    );
    process.exit(1);
  }

  const to = process.argv[2];
  if (!to) {
    console.log("Connection and login are fine. Pass an address to send a test email.");
    return;
  }
  // A real send against the production relay must be deliberate, never accidental
  if (env.APP_ENV === "production" && !process.argv.includes("--force")) {
    console.error("Refusing to send on production. Pass --force to send anyway.");
    process.exit(1);
  }

  const info = await sendEmailVerification(to, "email-check-dummy-token");
  console.log("Accepted by SMTP2GO:", { transport: info.transport, id: info.id, detail: info.detail });
  console.log(
    `Check the inbox for ${to}. The link should open ${env.LANDINGPAGE_URL}/auth/verify-email/...`
  );
}

main().catch(error => {
  console.error("email:check failed:", error);
  process.exit(1);
});
