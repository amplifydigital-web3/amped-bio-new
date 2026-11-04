import { prisma } from "@repo/database";

/**
 * Admin log for Amped Messages (PR M7, board m6). Who turned messaging off and why, who
 * opened a reported conversation, who paused or resumed a person, who changed caps. Kept
 * in SiteSettings `messaging.adminLog` as the latest 200 entries, newest first, so it
 * needs no table. Reading a reported conversation is a privacy event: it is logged.
 */
export const ADMIN_LOG_KEY = "messaging.adminLog";
const MAX_ENTRIES = 200;

export type AdminLogAction =
  | "kill_switch_off"
  | "kill_switch_on"
  | "case_opened"
  | "report_resolved"
  | "sender_paused"
  | "sender_resumed"
  | "inbound_resumed"
  | "caps_saved";

export type AdminLogEntry = {
  at: string;
  by: number;
  action: AdminLogAction;
  /** The person or report acted on, when there is one */
  target?: string;
  reason?: string;
};

export async function readAdminLog(): Promise<AdminLogEntry[]> {
  const row = await prisma.siteSettings.findUnique({ where: { setting_key: ADMIN_LOG_KEY } });
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.setting_value) as unknown;
    return Array.isArray(parsed) ? (parsed as AdminLogEntry[]) : [];
  } catch {
    return [];
  }
}

/** Add one entry. Best effort: a log failure never blocks the action. */
export async function appendAdminLog(entry: Omit<AdminLogEntry, "at">, now = new Date()) {
  try {
    const current = await readAdminLog();
    const next = [{ ...entry, at: now.toISOString() }, ...current].slice(0, MAX_ENTRIES);
    const value = JSON.stringify(next);
    await prisma.siteSettings.upsert({
      where: { setting_key: ADMIN_LOG_KEY },
      create: { setting_key: ADMIN_LOG_KEY, setting_value: value, value_type: "JSON" },
      update: { setting_value: value },
    });
  } catch (error) {
    console.error("[messaging-admin] log write failed:", error);
  }
  console.log(
    `[messaging-admin] ${entry.action} by ${entry.by}${entry.target ? ` on ${entry.target}` : ""}`
  );
}
