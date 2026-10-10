import nodemailer from "nodemailer";
import { render } from "@react-email/render";
import verifyEmailTemplate from "./VerifyEmailTemplate";
import resetPasswordTemplate from "./ResetPasswordTemplate";
import emailChangeTemplate from "./EmailChangeTemplate";
import emailChangeNoticeTemplate from "./EmailChangeNoticeTemplate";
import welcomeEmailTemplate from "./WelcomeEmailTemplate";
import { env } from "../../env";

// The /auth/verify-email and /auth/reset-password pages live on the landing
// page, not the client app (which has no /auth routes and redirects the token
// away). Email verification QA, 2026-10-10.
const baseURL = env.LANDINGPAGE_URL;
// Privacy Notice on the landing page of the current environment
const privacyUrl = new URL("/privacy", env.LANDINGPAGE_URL).toString();

type EmailOptions = {
  to: string | string[];
  html_body: string;
  subject: string;
};

// Create a nodemailer transporter
const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASSWORD,
  },
});

/**
 * Checks the SMTP connection and credentials once, without sending. Called at
 * boot so a bad SMTP2GO user, password or port shows up in the logs before the
 * first sign up, and by the email:check script.
 */
export const verifySmtpTransport = async (): Promise<boolean> => {
  const target = `${env.SMTP_HOST}:${env.SMTP_PORT} (secure=${env.SMTP_SECURE}, user=${env.SMTP_USER || "none"})`;
  try {
    await transporter.verify();
    console.log(`✅ SMTP transport ready: ${target}`);
    return true;
  } catch (error: any) {
    console.error(`❌ SMTP transport check failed for ${target}: ${error.message}`);
    return false;
  }
};

const sendEmail = async (options: EmailOptions) => {
  console.log("📧 Starting email sending process:", { to: options.to, subject: options.subject });

  // Validate required options
  console.log("🔍 Validating SMTP credentials...");

  console.log("🔍 Validating email options...");
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

  const mailOptions = {
    from: env.SMTP_FROM_EMAIL || "noreply@amped.bio",
    to: recipients.join(","),
    subject: options.subject,
    html: options.html_body,
  };

  console.log("📤 Attempting to send email via SMTP...");
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully:", {
      messageId: info.messageId,
      response: info.response,
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
  const emailComponent = verifyEmailTemplate({ url, privacyUrl });
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
  const emailComponent = resetPasswordTemplate({ url, privacyUrl });
  const htmlContent = await render(emailComponent);
  console.log("✅ Email template rendered successfully");

  console.log("📨 Sending password reset email...");
  return sendEmail({
    to: email,
    subject: "Amped.Bio Password Reset",
    html_body: htmlContent,
  });
};

// Screen Review 019 I02: the code goes to the new address, which proves the
// person controls it before it becomes their sign in email
export const sendEmailChangeVerification = async (newEmail: string, code: string) => {
  console.log("🔄 Sending email change verification code to the new address");

  console.log("🎨 Rendering email change template...");
  const emailComponent = emailChangeTemplate({ code, newEmail, privacyUrl });
  const htmlContent = await render(emailComponent);
  console.log("✅ Email template rendered successfully");

  console.log("📨 Sending email change verification code...");
  return sendEmail({
    to: newEmail,
    subject: "Your Amped.Bio email change code",
    html_body: htmlContent,
  });
};

export const sendWelcomeEmail = async (email: string, name?: string) => {
  console.log(`🎉 Sending welcome email to: ${email}`);

  console.log("🎨 Rendering welcome email template...");
  const emailComponent = welcomeEmailTemplate({ name, privacyUrl });
  const htmlContent = await render(emailComponent);
  console.log("✅ Email template rendered successfully");

  console.log("📨 Sending welcome email...");
  return sendEmail({
    to: email,
    subject: "Welcome to Amped.Bio!",
    html_body: htmlContent,
  });
};

// The current address hears about an email change request (019 I02, I11)
export const sendEmailChangeNotice = async (currentEmail: string, newEmail: string) => {
  const privacyLink = new URL("/privacy", env.LANDINGPAGE_URL).toString();
  const emailComponent = emailChangeNoticeTemplate({ newEmail, privacyUrl: privacyLink });
  const htmlContent = await render(emailComponent);
  return sendEmail({
    to: currentEmail,
    subject: "Your Amped.Bio email change request",
    html_body: htmlContent,
  });
};
