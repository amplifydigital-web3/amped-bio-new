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
 *
 * The sent email carries a dummy token. Opening its link shows the landing
 * page's "This link does not work" card, which proves the link lands on the
 * right host and page. A real token comes from sign up or Resend.
 */
import "dotenv/config";
import { env } from "../src/env";
import { sendEmailVerification, verifySmtpTransport } from "../src/utils/email/email";

async function main() {
  console.log("SMTP settings in use:", {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER || "(none)",
    from: env.SMTP_FROM_EMAIL,
    linksGoTo: env.LANDINGPAGE_URL,
  });

  const ready = await verifySmtpTransport();
  if (!ready) {
    console.error(
      "Fix SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER or SMTP_PASSWORD, then run again."
    );
    process.exit(1);
  }

  const to = process.argv[2];
  if (!to) {
    console.log("Connection and login are fine. Pass an address to send a test email.");
    return;
  }

  const info = await sendEmailVerification(to, "email-check-dummy-token");
  console.log("Accepted by the relay:", info.response);
  console.log(
    `Check the inbox for ${to}. The link should open ${env.LANDINGPAGE_URL}/auth/verify-email/...`
  );
}

main().catch(error => {
  console.error("email:check failed:", error);
  process.exit(1);
});
