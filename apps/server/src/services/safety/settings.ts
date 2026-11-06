/**
 * Safety settings (adult content review 8.7, PR R1): one JSON row in site_settings,
 * merged over SAFETY_SETTINGS_DEFAULTS so a missing key keeps its default. Changes
 * need the safety lead role (the router checks) and are logged.
 */
import { prisma } from "@repo/database";
import {
  SAFETY_SETTINGS_DEFAULTS,
  SAFETY_SETTINGS_KEY,
  type SafetySettings,
} from "@repo/constants";
import { logSafetyEvent } from "./events";

function merge(raw: unknown): SafetySettings {
  const stored = raw && typeof raw === "object" ? (raw as Partial<SafetySettings>) : {};
  const out: SafetySettings = { ...SAFETY_SETTINGS_DEFAULTS };
  for (const key of Object.keys(SAFETY_SETTINGS_DEFAULTS) as Array<keyof SafetySettings>) {
    const value = stored[key];
    if (value === undefined || value === null) continue;
    if (key === "onCall") {
      if (Array.isArray(value)) out.onCall = value as SafetySettings["onCall"];
    } else if (typeof value === "number" && Number.isFinite(value)) {
      (out[key] as number) = value;
    }
  }
  return out;
}

export async function getSafetySettings(): Promise<SafetySettings> {
  const row = await prisma.siteSettings.findUnique({
    where: { setting_key: SAFETY_SETTINGS_KEY },
  });
  if (!row) return { ...SAFETY_SETTINGS_DEFAULTS };
  try {
    return merge(JSON.parse(row.setting_value));
  } catch {
    console.error("[safety] settings row is not JSON; using defaults");
    return { ...SAFETY_SETTINGS_DEFAULTS };
  }
}

/** Writes the merged settings and logs which keys changed (never the on call contacts). */
export async function updateSafetySettings(
  patch: Partial<SafetySettings>,
  actorId: number
): Promise<SafetySettings> {
  const current = await getSafetySettings();
  const next = merge({ ...current, ...patch });
  const changed = (Object.keys(patch) as Array<keyof SafetySettings>).filter(
    key => JSON.stringify(current[key]) !== JSON.stringify(next[key])
  );
  await prisma.siteSettings.upsert({
    where: { setting_key: SAFETY_SETTINGS_KEY },
    create: {
      setting_key: SAFETY_SETTINGS_KEY,
      setting_value: JSON.stringify(next),
      value_type: "JSON",
    },
    update: { setting_value: JSON.stringify(next) },
  });
  if (changed.length) {
    await logSafetyEvent({ actorId, action: "setting_change", detail: { keys: changed } });
  }
  return next;
}
