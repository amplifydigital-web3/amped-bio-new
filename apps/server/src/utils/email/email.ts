import nodemailer from "nodemailer";
import { render } from "@react-email/render";
import verifyEmailTemplate from "./VerifyEmailTemplate";
import resetPasswordTemplate from "./ResetPasswordTemplate";
import emailChangeTemplate from "./EmailChangeTemplate";
import welcomeEmailTemplate from "./WelcomeEmailTemplate";
import { env } from "../../env";

const baseURL = env.APP_URL;

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
  console.log("🔗 Verification URL generated:", url);

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
  console.log("🔗 Password reset URL generated:", url);

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
