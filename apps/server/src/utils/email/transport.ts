import nodemailer from "nodemailer";
import { env } from "../../env";

/**
 * Delivery for every Amped.Bio email (verification, password reset, email
 * change, welcome). Two ways to reach SMTP2GO:
 *
 * - "smtp2go-api": HTTPS POST to the SMTP2GO send API with an API key. Runs on
 *   port 443, so it works on hosts that block outbound SMTP ports, and
 *   SMTP2GO answers with a readable reason when it refuses a message
 *   (unverified sender, bad key, quota). Preferred on staging and production.
 * - "smtp": the SMTP relay (mail.smtp2go.com, port 2525 with STARTTLS) with an
 *   SMTP user and password. Also what local MailDev uses.
 *
 * EMAIL_TRANSPORT=auto (the default) uses the API when SMTP2GO_API_KEY is set
 * and SMTP otherwise. Keep this file identical in apps/server and
 * apps/auth-server.
 */

export type EmailTransportName = "smtp2go-api" | "smtp";

export type OutgoingEmail = {
  to: string[];
  subject: string;
  html: string;
};

export type DeliveryResult = {
  transport: EmailTransportName;
  /** SMTP2GO email_id or the SMTP message id */
  id: string | null;
  /** SMTP2GO request id or the SMTP server's reply */
  detail: string | null;
};

const API_TIMEOUT_MS = 15_000;

export function activeTransport(): EmailTransportName {
  if (env.EMAIL_TRANSPORT === "smtp2go-api" || env.EMAIL_TRANSPORT === "smtp") {
    return env.EMAIL_TRANSPORT;
  }
  return env.SMTP2GO_API_KEY ? "smtp2go-api" : "smtp";
}

/** "Amped.Bio <noreply@amped.bio>". The address must be a verified sender in SMTP2GO. */
export function senderAddress(): string {
  const name = env.SMTP_FROM_NAME.replace(/[<>"]/g, "").trim();
  return name ? `${name} <${env.SMTP_FROM_EMAIL}>` : env.SMTP_FROM_EMAIL;
}

/** A one line description of where email goes, with no secrets in it. */
export function describeTransport(): string {
  if (activeTransport() === "smtp2go-api") {
    return `SMTP2GO API ${env.SMTP2GO_API_URL} (key ${env.SMTP2GO_API_KEY ? "set" : "missing"}), from ${senderAddress()}`;
  }
  return `SMTP ${env.SMTP_HOST}:${env.SMTP_PORT} (secure=${env.SMTP_SECURE}, user=${env.SMTP_USER || "none"}), from ${senderAddress()}`;
}

// ---------- SMTP ----------

const smtp = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  // Nodemailer waits up to 2 minutes to connect and 10 minutes on a stalled
  // socket by default. Fail fast instead of hanging a request.
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
});

async function sendViaSmtp(email: OutgoingEmail): Promise<DeliveryResult> {
  const info = await smtp.sendMail({
    from: senderAddress(),
    to: email.to.join(","),
    subject: email.subject,
    html: email.html,
  });
  return { transport: "smtp", id: info.messageId ?? null, detail: info.response ?? null };
}

// ---------- SMTP2GO API ----------

type Smtp2goResponse = {
  request_id?: string;
  data?: {
    succeeded?: number;
    failed?: number;
    failures?: unknown[];
    email_id?: string;
    error?: string;
    error_code?: string;
    field_validation_errors?: { fieldname?: string; message?: string };
  };
  error?: string;
  error_code?: string;
};

async function smtp2go(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${env.SMTP2GO_API_URL.replace(/\/+$/, "")}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Smtp2go-Api-Key": env.SMTP2GO_API_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  let json: Smtp2goResponse = {};
  try {
    json = (await response.json()) as Smtp2goResponse;
  } catch {
    // Non JSON body (gateway error); the status says enough
  }
  return { status: response.status, json };
}

/** The reason SMTP2GO gave, in one line. */
function smtp2goReason(status: number, json: Smtp2goResponse): string {
  const data = json.data ?? {};
  const parts = [
    data.error ?? json.error,
    data.error_code ?? json.error_code,
    data.field_validation_errors?.message,
    Array.isArray(data.failures) && data.failures.length ? JSON.stringify(data.failures) : null,
  ].filter(Boolean);
  if (status === 401) parts.unshift("API key rejected (401)");
  if (status === 403) parts.unshift("API key lacks permission (403)");
  return parts.length ? parts.join(" | ") : `HTTP ${status}`;
}

async function sendViaApi(email: OutgoingEmail): Promise<DeliveryResult> {
  if (!env.SMTP2GO_API_KEY) throw new Error("SMTP2GO_API_KEY is not set");
  const { status, json } = await smtp2go("/email/send", {
    sender: senderAddress(),
    to: email.to,
    subject: email.subject,
    html_body: email.html,
  });
  const data = json.data ?? {};
  // SMTP2GO can answer 200 with failures listed, so check the counts too
  const accepted = status >= 200 && status < 300 && !data.error && (data.failed ?? 0) === 0;
  if (!accepted || (data.succeeded ?? 0) < 1) {
    throw new Error(`SMTP2GO refused the email: ${smtp2goReason(status, json)}`);
  }
  return { transport: "smtp2go-api", id: data.email_id ?? null, detail: json.request_id ?? null };
}

// ---------- public ----------

export async function deliverEmail(email: OutgoingEmail): Promise<DeliveryResult> {
  return activeTransport() === "smtp2go-api" ? sendViaApi(email) : sendViaSmtp(email);
}

/**
 * Checks the configured transport without sending: SMTP connects and logs in;
 * the API answers an authenticated read. Returns the reason on failure.
 */
export async function checkTransport(): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (activeTransport() === "smtp2go-api") {
      if (!env.SMTP2GO_API_KEY) return { ok: false, reason: "SMTP2GO_API_KEY is not set" };
      const { status, json } = await smtp2go("/stats/email_summary", {});
      // 403 means the key is valid but has no stats permission; sending can still work
      if (status === 401) return { ok: false, reason: smtp2goReason(status, json) };
      if (status >= 500) return { ok: false, reason: smtp2goReason(status, json) };
      return { ok: true };
    }
    await smtp.verify();
    return { ok: true };
  } catch (error: any) {
    return { ok: false, reason: error?.message ?? String(error) };
  }
}

/**
 * True when the settings cannot work outside a developer machine: SMTP still
 * pointing at the MailDev default. Logged loudly at boot.
 */
export function misconfiguredForDeployment(): string | null {
  if (env.APP_ENV !== "production" && env.APP_ENV !== "staging") return null;
  if (activeTransport() === "smtp2go-api") return null;
  if (["localhost", "127.0.0.1", "maildev"].includes(env.SMTP_HOST)) {
    return `SMTP_HOST is "${env.SMTP_HOST}" on ${env.APP_ENV}. Set SMTP2GO_API_KEY, or SMTP_HOST=mail.smtp2go.com with SMTP_PORT, SMTP_USER and SMTP_PASSWORD.`;
  }
  if (!env.SMTP_USER) {
    return `SMTP_USER is empty on ${env.APP_ENV}. SMTP2GO needs the SMTP user and password from the SMTP Users page.`;
  }
  return null;
}
