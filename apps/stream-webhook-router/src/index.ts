/**
 * Stream webhook router Worker (Build Board #20, single Cloudflare account).
 *
 * Cloudflare Stream allows one webhook subscription per account. Staging and
 * production share one account, so this Worker is that one webhook. It:
 *
 *   1. Accepts POST /cloudflare-stream only, with a body of at most 256 KB.
 *   2. Verifies the Stream signature with the account webhook secret.
 *   3. Reads meta.env from the event. Every video and clip is created with
 *      meta { publicId, env } by the API (content system spec 3.4).
 *   4. Forwards the exact body to that environment's API, re-signed with a
 *      secret only that environment holds. An event with no meta.env goes to
 *      both APIs; each one acts only on the video ids it owns. An event with any
 *      other env value is dropped.
 *   5. Answers 502 when a target fails, so Stream retries. Every API step is
 *      idempotent, so a repeat delivery is harmless.
 *
 * The forward signature uses the same format Stream uses, so the API's existing
 * verifyStreamWebhookSignature checks it unchanged. Staging never holds the
 * account secret or the production forward secret, so a staging credential
 * cannot forge a production webhook.
 *
 * Logs carry the video uid, the env and the target status. Never the body.
 */

export interface RouterEnv {
  /** The account webhook secret Stream returned when the webhook was set. */
  STREAM_WEBHOOK_SECRET: string;
  /** Equals CF_STREAM_WEBHOOK_SECRET on the production API. */
  PRODUCTION_FORWARD_SECRET: string;
  /** Equals CF_STREAM_WEBHOOK_SECRET on the staging API. */
  STAGING_FORWARD_SECRET: string;
  /** Full webhook URL on the production API. */
  PRODUCTION_TARGET: string;
  /** Full webhook URL on the staging API. */
  STAGING_TARGET: string;
}

/** Same values as STREAM_WEBHOOK_SIGNATURE_HEADER and STREAM_WEBHOOK_WINDOW_SECONDS in @repo/constants. */
export const SIGNATURE_HEADER = "webhook-signature";
export const WINDOW_SECONDS = 5 * 60;
export const MAX_BODY_BYTES = 256 * 1024;
const FORWARD_TIMEOUT_MS = 10_000;

export type TargetName = "production" | "staging";

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  return Array.from(mac, byte => byte.toString(16).padStart(2, "0")).join("");
}

function concat(prefix: string, body: Uint8Array): Uint8Array {
  const head = encoder.encode(prefix);
  const out = new Uint8Array(head.length + body.length);
  out.set(head, 0);
  out.set(body, head.length);
  return out;
}

/** Signature header in Stream's format: `time={unix},sig1={hex}` over `${time}.${body}`. */
export async function signatureFor(
  secret: string,
  body: Uint8Array,
  nowSeconds: number
): Promise<string> {
  const time = String(nowSeconds);
  return `time=${time},sig1=${await hmacHex(secret, concat(`${time}.`, body))}`;
}

export async function verifySignature(
  body: Uint8Array,
  header: string | null,
  secret: string,
  nowSeconds: number
): Promise<boolean> {
  if (!header || !secret) return false;
  const fields = new Map(
    header.split(",").map(part => {
      const index = part.indexOf("=");
      return [part.slice(0, index).trim(), part.slice(index + 1).trim()] as const;
    })
  );
  const timeText = fields.get("time") ?? "";
  const given = fields.get("sig1") ?? "";
  const time = Number(timeText);
  if (!Number.isInteger(time) || !/^[a-f0-9]{64}$/.test(given)) return false;
  if (Math.abs(nowSeconds - time) > WINDOW_SECONDS) return false;
  const expected = await hmacHex(secret, concat(`${timeText}.`, body));
  return crypto.subtle.timingSafeEqual(encoder.encode(expected), encoder.encode(given));
}

/**
 * Which APIs receive the event. A known env goes to that API, a missing env goes
 * to both, and any other value goes nowhere.
 */
export function targetsFor(body: unknown): TargetName[] {
  const meta = body && typeof body === "object" ? (body as { meta?: unknown }).meta : undefined;
  const value = meta && typeof meta === "object" ? (meta as { env?: unknown }).env : undefined;
  if (value === undefined || value === null || value === "") return ["production", "staging"];
  if (value === "production") return ["production"];
  if (value === "staging") return ["staging"];
  return [];
}

function uidOf(body: unknown): string {
  const uid = body && typeof body === "object" ? (body as { uid?: unknown }).uid : undefined;
  return typeof uid === "string" && /^[a-f0-9]{32}$/.test(uid) ? uid : "unknown";
}

/** Status logged for a target whose URL or forward secret is not set on this Worker. */
export const NOT_CONFIGURED = -1;

/**
 * 2xx is delivered. 404 means that API has no webhook secret set, and NOT_CONFIGURED
 * means this Worker has no URL or secret for it: a retry cannot help either, and a
 * 502 would make Stream retry every event for the environment that is configured.
 */
function delivered(status: number): boolean {
  return (status >= 200 && status < 300) || status === 404 || status === NOT_CONFIGURED;
}

async function forward(
  target: TargetName,
  body: Uint8Array,
  env: RouterEnv,
  nowSeconds: number
): Promise<number> {
  const url = target === "production" ? env.PRODUCTION_TARGET : env.STAGING_TARGET;
  const secret =
    target === "production" ? env.PRODUCTION_FORWARD_SECRET : env.STAGING_FORWARD_SECRET;
  if (!url || !secret) return NOT_CONFIGURED;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SIGNATURE_HEADER]: await signatureFor(secret, body, nowSeconds),
      },
      body,
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
    });
    return response.status;
  } catch {
    return 0;
  }
}

export async function handle(
  request: Request,
  env: RouterEnv,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== "/cloudflare-stream") {
    return new Response(null, { status: 404 });
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  const valid = await verifySignature(
    body,
    request.headers.get(SIGNATURE_HEADER),
    env.STREAM_WEBHOOK_SECRET,
    nowSeconds
  );
  if (!valid) return new Response(null, { status: 401 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    // Signed but not JSON: nothing to route and nothing to retry
    return new Response(null, { status: 200 });
  }

  const uid = uidOf(parsed);
  const targets = targetsFor(parsed);
  if (targets.length === 0) {
    console.log(JSON.stringify({ event: "stream_webhook", uid, result: "dropped_unknown_env" }));
    return new Response(null, { status: 200 });
  }

  const statuses = await Promise.all(targets.map(t => forward(t, body, env, nowSeconds)));
  const results = Object.fromEntries(targets.map((t, i) => [t, statuses[i]]));
  const ok = statuses.every(delivered);
  console.log(
    JSON.stringify({ event: "stream_webhook", uid, results, result: ok ? "forwarded" : "retry" })
  );
  return new Response(null, { status: ok ? 200 : 502 });
}

export default {
  fetch(request: Request, env: RouterEnv): Promise<Response> {
    return handle(request, env);
  },
} satisfies ExportedHandler<RouterEnv>;
