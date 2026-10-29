import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../env";

/**
 * Mini App launch data (spec 3.7, Telegram "Validating data received via the Mini App").
 * The data check string is every field but `hash`, sorted by key, as `key=value` lines.
 * The secret is HMAC_SHA256("WebAppData", bot token); the hash is the hex HMAC_SHA256 of
 * the check string under that secret. Data older than an hour is refused.
 */

export const INIT_DATA_MAX_AGE_SECONDS = 60 * 60;

export type MiniAppUser = { id: number; firstName: string | null; languageCode: string | null };

export type InitDataResult =
  | { ok: true; user: MiniAppUser; startParam: string | null; authDate: Date }
  | { ok: false; reason: "missing" | "bad_hash" | "expired" | "no_user" | "off" };

function hmac(key: Buffer | string, data: string) {
  return createHmac("sha256", key).update(data).digest();
}

/** The hash Telegram would send for these fields under this bot token. */
export function initDataHash(fields: Array<[string, string]>, botToken: string) {
  const check = fields
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  return hmac(hmac("WebAppData", botToken), check).toString("hex");
}

export function validateInitData(
  raw: string | null | undefined,
  now = new Date(),
  botToken = env.TELEGRAM_BOT_TOKEN
): InitDataResult {
  if (!botToken) return { ok: false, reason: "off" };
  if (!raw || raw.length > 4096) return { ok: false, reason: "missing" };
  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return { ok: false, reason: "bad_hash" };

  const expected = Buffer.from(initDataHash(Array.from(params.entries()), botToken), "hex");
  const given = Buffer.from(hash, "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "bad_hash" };
  }

  const authSeconds = Number(params.get("auth_date"));
  if (!Number.isFinite(authSeconds) || authSeconds <= 0) return { ok: false, reason: "expired" };
  const ageSeconds = now.getTime() / 1000 - authSeconds;
  if (ageSeconds > INIT_DATA_MAX_AGE_SECONDS || ageSeconds < -60) {
    return { ok: false, reason: "expired" };
  }

  let user: MiniAppUser | null = null;
  try {
    const parsed = JSON.parse(params.get("user") ?? "null") as {
      id?: unknown;
      first_name?: unknown;
      language_code?: unknown;
    } | null;
    if (parsed && typeof parsed.id === "number" && Number.isSafeInteger(parsed.id)) {
      user = {
        id: parsed.id,
        firstName: typeof parsed.first_name === "string" ? parsed.first_name : null,
        languageCode: typeof parsed.language_code === "string" ? parsed.language_code : null,
      };
    }
  } catch {
    user = null;
  }
  if (!user) return { ok: false, reason: "no_user" };

  return {
    ok: true,
    user,
    startParam: params.get("start_param"),
    authDate: new Date(authSeconds * 1000),
  };
}
