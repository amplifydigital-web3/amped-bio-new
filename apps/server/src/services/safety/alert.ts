/**
 * Child safety alerts (adult content review 8.5, PR R1). A child safety case reaches
 * the safety leads and the on call list within a minute, by email and by SMS.
 *
 * - Email goes to every account whose role includes `safety_lead`, to the on call
 *   emails in Settings, and to SAFETY_ALERT_EMAIL, through the transactional email.
 * - SMS goes to the on call phones through a Twilio Messaging Service (Q8, Rob 3 Nov).
 *   Each message is tried 3 times (two retries), then logged as
 *   `[safety] ALERT sms failed`; the email still goes.
 * - The message carries the case number and a link to the case, never the creator,
 *   the title or media. The log records counts only, never an address or number.
 */
import { prisma } from "@repo/database";
import { env } from "../../env";
import { deliverEmail } from "../../utils/email/transport";
import { logSafetyEvent } from "./events";
import { getSafetySettings } from "./settings";

export const SMS_ATTEMPTS = 3;

/** The alert text. Exported for tests: it must name no creator, title or media. */
export function childSafetyAlertText(caseNumber: string, link: string | null): string {
  return `Amped Safety: child safety case ${caseNumber} is open and needs a safety lead now.${
    link ? ` ${link}` : ""
  }`;
}

export function caseLink(caseNumber: string): string | null {
  return env.ADMIN_URL ? `${env.ADMIN_URL.replace(/\/$/, "")}/safety?case=${caseNumber}` : null;
}

export function twilioConfigured(): boolean {
  return Boolean(
    env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_MESSAGING_SERVICE_SID
  );
}

/** One SMS through the Messaging Service. Throws on a non 2xx answer. */
export async function sendTwilioSms(to: string, body: string): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: to,
      MessagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
      Body: body,
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`twilio ${response.status}`);
}

async function smsWithRetry(to: string, body: string, wait: (ms: number) => Promise<void>) {
  for (let attempt = 1; attempt <= SMS_ATTEMPTS; attempt += 1) {
    try {
      await sendTwilioSms(to, body);
      return true;
    } catch (error) {
      if (attempt === SMS_ATTEMPTS) {
        console.error("[safety] ALERT sms failed", {
          attempts: attempt,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
      await wait(1000 * attempt);
    }
  }
  return false;
}

/** Accounts whose comma separated role includes safety_lead. */
async function safetyLeadEmails(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { role: { contains: "safety_lead" } },
    select: { email: true, role: true },
  });
  return rows
    .filter(row =>
      row.role
        .split(",")
        .map(r => r.trim())
        .includes("safety_lead")
    )
    .map(row => row.email)
    .filter((email): email is string => Boolean(email));
}

export type AlertResult = { emails: number; sms: number; smsFailed: number };

export async function sendChildSafetyAlert(
  caseId: Uint8Array,
  options: { wait?: (ms: number) => Promise<void> } = {}
): Promise<AlertResult> {
  const wait = options.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const safetyCase = await prisma.safetyCase.findUnique({
    where: { id: Buffer.from(caseId) },
    select: { number: true },
  });
  if (!safetyCase) return { emails: 0, sms: 0, smsFailed: 0 };
  const settings = await getSafetySettings();
  const text = childSafetyAlertText(safetyCase.number, caseLink(safetyCase.number));

  const emails = [
    ...new Set(
      [
        ...(await safetyLeadEmails()),
        ...settings.onCall.map(person => person.email ?? ""),
        env.SAFETY_ALERT_EMAIL,
      ]
        .map(email => email.trim())
        .filter(Boolean)
    ),
  ];
  let emailed = 0;
  if (emails.length) {
    try {
      await deliverEmail({
        to: emails,
        subject: `Child safety case ${safetyCase.number}`,
        html: `<p>${text.replace(/</g, "&lt;")}</p>`,
      });
      emailed = emails.length;
    } catch (error) {
      console.error("[safety] ALERT email failed", {
        case: safetyCase.number,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    console.error("[safety] ALERT no email recipients for child safety", {
      case: safetyCase.number,
    });
  }

  const phones = [
    ...new Set(settings.onCall.map(person => person.phone?.trim() ?? "").filter(Boolean)),
  ];
  let sent = 0;
  let failed = 0;
  if (phones.length && !twilioConfigured()) {
    console.error("[safety] ALERT sms failed", { reason: "twilio_not_configured" });
    failed = phones.length;
  } else {
    for (const phone of phones) {
      if (await smsWithRetry(phone, text, wait)) sent += 1;
      else failed += 1;
    }
  }

  await logSafetyEvent({
    caseId,
    action: "alert_sent",
    detail: { emails: emailed, sms: sent, smsFailed: failed },
  });
  return { emails: emailed, sms: sent, smsFailed: failed };
}
