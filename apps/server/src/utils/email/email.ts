import nodemailer from "nodemailer";
import { render } from "@react-email/render";
import verifyEmailTemplate from "./VerifyEmailTemplate";
import resetPasswordTemplate from "./ResetPasswordTemplate";
import emailChangeTemplate from "./EmailChangeTemplate";
import welcomeEmailTemplate from "./WelcomeEmailTemplate";
import { env } from "../../env";

const siteURL = env.SITE_URL;

type EmailOptions = {
  to: string | string[];
  html_body: string;
  subject: string;
};

// Create a nodemailer transporter
const _ts = new Date().toISOString();
console.error(`[${_ts}] [EMAIL] Creating nodemailer transporter with:`);
console.error(`[${_ts}] [EMAIL]   host=${env.SMTP_HOST} port=${env.SMTP_PORT} secure=${env.SMTP_SECURE}`);
console.error(`[${_ts}] [EMAIL]   user=${env.SMTP_USER ? "SET" : "EMPTY"} pass=${env.SMTP_PASSWORD ? "SET" : "EMPTY"}`);
console.error(`[${_ts}] [EMAIL]   from=${env.SMTP_FROM_EMAIL || "noreply@amped.bio"}`);
console.error(`[${_ts}] [EMAIL]   siteURL=${siteURL}`);

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASSWORD,
  },
});

// Verify SMTP connection on startup
transporter.verify().then(() => {
  console.error(`[${new Date().toISOString()}] [EMAIL] SMTP connection VERIFIED OK`);
}).catch((err: any) => {
  console.error(`[${new Date().toISOString()}] [EMAIL] SMTP connection VERIFY FAILED:`, err.message, err.stack);
});

const sendEmail = async (options: EmailOptions) => {
  const ts = new Date().toISOString();
  console.error(`[${ts}] [EMAIL.sendEmail] ENTERED to=${options.to} subject=${options.subject}`);
  console.log(`[${ts}] 📧 Starting email sending process:`, { to: options.to, subject: options.subject });

  // Validate required options
  if (!options.to) {
    console.error(`[${ts}] ❌ Email recipient missing`);
    throw new Error("Email recipient is required");
  }

  if (!options.subject) {
    console.error(`[${ts}] ❌ Email subject missing`);
    throw new Error("Email subject is required");
  }

  if (!options.html_body) {
    console.error(`[${ts}] ❌ Email body missing`);
    throw new Error("html_body is required");
  }
  console.log(`[${ts}] ✅ Email options validated`);

  const recipients = Array.isArray(options.to) ? options.to : [options.to];
  console.error(`[${ts}] [EMAIL.sendEmail] recipients=${recipients.join(",")}`);
  console.log(`[${ts}] 👥 Preparing email for ${recipients.length} recipient(s):`, recipients);

  const mailOptions = {
    from: env.SMTP_FROM_EMAIL || "noreply@amped.bio",
    to: recipients.join(","),
    subject: options.subject,
    html: options.html_body,
  };

  console.error(`[${ts}] [EMAIL.sendEmail] Calling transporter.sendMail...`);
  console.log(`[${ts}] 📤 Attempting to send email via SMTP...`);
  try {
    const info = await transporter.sendMail(mailOptions);
    console.error(`[${ts}] [EMAIL.sendEmail] SENT OK messageId=${info.messageId} response=${info.response}`);
    console.log(`[${ts}] ✅ Email sent successfully:`, {
      messageId: info.messageId,
      response: info.response,
      timestamp: ts,
    });
    return info;
  } catch (error: any) {
    console.error(`[${ts}] ❌❌❌ Email sending FAILED:`, {
      error: error.message,
      code: error.code,
      command: error.command,
      stack: error.stack,
      timestamp: ts,
    });
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

export const sendEmailVerification = async (email: string, token: string) => {
  const ts = new Date().toISOString();
  console.error(`[${ts}] [EMAIL.sendEmailVerification] ENTERED email=${email} token=${token}`);
  console.log(`[${ts}] 🔗 Generating verification URL for email: ${email}`);
  const url = `${siteURL}/auth/verify-email/${token}?email=${encodeURIComponent(email)}`;
  console.error(`[${ts}] [EMAIL.sendEmailVerification] url=${url}`);
  console.log(`[${ts}] 🔗 Verification URL generated:`, url);

  console.error(`[${ts}] [EMAIL.sendEmailVerification] Rendering verifyEmailTemplate...`);
  console.log(`[${ts}] 🎨 Rendering email verification template...`);
  const emailComponent = verifyEmailTemplate({ url });
  const htmlContent = await render(emailComponent);
  console.error(`[${ts}] [EMAIL.sendEmailVerification] Template rendered (${htmlContent.length} chars)`);
  console.log(`[${ts}] ✅ Email template rendered successfully`);

  console.error(`[${ts}] [EMAIL.sendEmailVerification] Calling sendEmail...`);
  console.log(`[${ts}] 📨 Sending verification email...`);
  return sendEmail({
    to: email,
    subject: "Amped.Bio Email Verification",
    html_body: htmlContent,
  });
};

export const sendPasswordResetEmail = async (email: string, token: string) => {
  const ts = new Date().toISOString();
  console.error(`[${ts}] [EMAIL.sendPasswordResetEmail] ENTERED email=${email} token=${token}`);
  console.log(`[${ts}] 🔑 Generating password reset URL for email: ${email}`);
  const url = `${siteURL}/auth/reset-password/${token}`;
  console.error(`[${ts}] [EMAIL.sendPasswordResetEmail] url=${url}`);
  console.log(`[${ts}] 🔗 Password reset URL generated:`, url);

  console.error(`[${ts}] [EMAIL.sendPasswordResetEmail] Rendering resetPasswordTemplate...`);
  console.log(`[${ts}] 🎨 Rendering password reset template...`);
  const emailComponent = resetPasswordTemplate({ url });
  const htmlContent = await render(emailComponent);
  console.error(`[${ts}] [EMAIL.sendPasswordResetEmail] Template rendered (${htmlContent.length} chars)`);
  console.log(`[${ts}] ✅ Email template rendered successfully`);

  console.error(`[${ts}] [EMAIL.sendPasswordResetEmail] Calling sendEmail...`);
  console.log(`[${ts}] 📨 Sending password reset email...`);
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
    to: email, // Send to the current/old email address for verification
    subject: "Amped.Bio Email Change Verification",
    html_body: htmlContent,
  });
};

export const sendWelcomeEmail = async (email: string, name?: string) => {
  console.log(`🎉 Sending welcome email to: ${email}`);

  console.log("🎨 Rendering welcome email template...");
  const emailComponent = welcomeEmailTemplate({ name });
  const htmlContent = await render(emailComponent);
  console.log("✅ Email template rendered successfully");

  console.log("📨 Sending welcome email...");
  return sendEmail({
    to: email,
    subject: "Welcome to Amped.Bio!",
    html_body: htmlContent,
  });
};
