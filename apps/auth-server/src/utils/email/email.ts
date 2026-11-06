import { render } from "@react-email/render";
import verifyEmailTemplate from "./VerifyEmailTemplate";
import resetPasswordTemplate from "./ResetPasswordTemplate";
import emailChangeTemplate from "./EmailChangeTemplate";
import welcomeEmailTemplate from "./WelcomeEmailTemplate";
import { env } from "../../env";
import {
  checkTransport,
  deliverEmail,
  describeTransport,
  misconfiguredForDeployment,
} from "./transport";

// The /auth/verify-email and /auth/reset-password pages live on the landing
// page, not the client app (which has no /auth routes and redirects the token
// away). Email verification QA, 2026-10-10.
const baseURL = env.LANDINGPAGE_URL;

type EmailOptions = {
  to: string | string[];
  html_body: string;
  subject: string;
};

/**
 * Checks the email transport once, without sending. Called at boot so a bad
 * SMTP2GO key, user, password, port or sender setting shows up in the logs
 * before the first sign up, and by the email:check script.
 */
export const verifySmtpTransport = async (): Promise<boolean> => {
  const target = describeTransport();
  const misconfigured = misconfiguredForDeployment();
  if (misconfigured) {
    console.error(`❌ Email is not configured for ${env.APP_ENV}: ${misconfigured}`);
    return false;
  }
  const { ok, reason } = await checkTransport();
  if (ok) console.log(`✅ Email transport ready: ${target}`);
  else console.error(`❌ Email transport check failed for ${target}: ${reason}`);
  return ok;
};

const sendEmail = async (options: EmailOptions) => {
  console.log("📧 Starting email sending process:", { to: options.to, subject: options.subject });

  if (!options.to) {
    console.error("❌ Email recipient missing");
    throw new Error("Email recipient is required");
  }

  if (!options.subject) {
    console.error("❌ Email subject missing");
    throw new Error("Email subject is required");
  }

  if (!options.html_body) {
    console.error("❌ Email body missing");
    throw new Error("html_body is required");
  }
  console.log("✅ Email options validated");

  const recipients = Array.isArray(options.to) ? options.to : [options.to];
  console.log(`👥 Preparing email for ${recipients.length} recipient(s):`, recipients);

  console.log(`📤 Sending via ${describeTransport()}`);
  try {
    const info = await deliverEmail({
      to: recipients,
      subject: options.subject,
      html: options.html_body,
    });
    console.log("✅ Email accepted:", {
      transport: info.transport,
      id: info.id,
      detail: info.detail,
      timestamp: new Date().toISOString(),
    });
    return info;
  } catch (error: any) {
    console.error("❌ Email sending failed:", {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

export const sendEmailVerification = async (email: string, token: string) => {
  console.log(`🔗 Generating verification URL for email: ${email}`);
  const url = `${baseURL}/auth/verify-email/${token}?email=${encodeURIComponent(email)}`;
  console.log("🔗 Verification URL generated for", baseURL);

  console.log("🎨 Rendering email verification template...");
  const emailComponent = verifyEmailTemplate({ url });
  const htmlContent = await render(emailComponent);
  console.log("✅ Email template rendered successfully");

  console.log("📨 Sending verification email...");
  return sendEmail({
    to: email,
    subject: "Amped.Bio Email Verification",
    html_body: htmlContent,
  });
};

export const sendPasswordResetEmail = async (email: string, token: string) => {
  console.log(`🔑 Generating password reset URL for email: ${email}`);
  const url = `${baseURL}/auth/reset-password/${token}`;
  console.log("🔗 Password reset URL generated for", baseURL);

  console.log("🎨 Rendering password reset template...");
  const emailComponent = resetPasswordTemplate({ url });
  const htmlContent = await render(emailComponent);
  console.log("✅ Email template rendered successfully");

  console.log("📨 Sending password reset email...");
  return sendEmail({
    to: email,
    subject: "Amped.Bio Password Reset",
    html_body: htmlContent,
  });
};

export const sendEmailChangeVerification = async (
  email: string,
  newEmail: string,
  code: string
) => {
  console.log(`🔄 Generating email change verification code for ${email} -> ${newEmail}`);

  console.log("🎨 Rendering email change template...");
  const emailComponent = emailChangeTemplate({ code, newEmail });
  const htmlContent = await render(emailComponent);
  console.log("✅ Email template rendered successfully");

  console.log("📨 Sending email change verification code...");
  return sendEmail({
    to: email,
    subject: "Amped.Bio Email Change Verification",
    html_body: htmlContent,
  });
};

export const sendWelcomeEmail = async (email: string, name?: string) => {
  console.log(`🎉 Sending welcome email to: ${email}`);

  console.log("🎨 Rendering welcome email template...");
  const emailComponent = welcomeEmailTemplate({ name: name ?? undefined });
  const htmlContent = await render(emailComponent);
  console.log("✅ Email template rendered successfully");

  console.log("📨 Sending welcome email...");
  return sendEmail({
    to: email,
    subject: "Welcome to Amped.Bio!",
    html_body: htmlContent,
  });
};
