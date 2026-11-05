/**
 * Workers KV writes for the TAKEDOWN namespace (content takedown C7a, spec 4.4).
 * The media gateway reads `blocked:` and `private:` keys before its cache; the
 * API is the only writer, through the REST API, the way queue.ts calls Queues.
 *
 * PUT    /accounts/{account}/storage/kv/namespaces/{ns}/values/{key}
 * DELETE /accounts/{account}/storage/kv/namespaces/{ns}/values/{key}
 * PUT    /accounts/{account}/storage/kv/namespaces/{ns}/bulk          (up to 10,000 pairs)
 * POST   /accounts/{account}/storage/kv/namespaces/{ns}/bulk/delete   (up to 10,000 keys)
 * Token permission: Workers KV Storage Edit, on this account only.
 * Docs (checked 4 Nov 2026): https://developers.cloudflare.com/kv/api/write-key-value-pairs/
 *
 * One write per key per second: a 429 is thrown, and the edge sync loop retries
 * it on its next pass rather than in a tight loop.
 */
import { env } from "../../env";

const API = "https://api.cloudflare.com/client/v4";
const REQUEST_TIMEOUT_MS = 10_000;
/** Spec 4.3: bulk requests carry 1,000 keys each. */
export const KV_BULK_BATCH = 1000;

export class KvWriteError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "KvWriteError";
  }
}

export function takedownKvConfigured(): boolean {
  return Boolean(env.CF_ACCOUNT_ID && env.CF_KV_API_TOKEN && env.CF_TAKEDOWN_NAMESPACE_ID);
}

function namespaceUrl(path: string): string {
  return `${API}/accounts/${env.CF_ACCOUNT_ID}/storage/kv/namespaces/${env.CF_TAKEDOWN_NAMESPACE_ID}${path}`;
}

async function call(path: string, init: RequestInit): Promise<void> {
  if (!takedownKvConfigured()) throw new KvWriteError("Takedown KV is not configured", 0);
  const response = await fetch(namespaceUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${env.CF_KV_API_TOKEN}`,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  // A delete of a missing key is the goal already reached
  if (response.ok || (init.method === "DELETE" && response.status === 404)) return;
  // The method and status only: the path holds the key, which names an item, and
  // the body may echo the request
  throw new KvWriteError(`KV ${init.method} failed: ${response.status}`, response.status);
}

export async function putTakedownKey(key: string, value: string): Promise<void> {
  await call(`/values/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: value,
  });
}

export async function deleteTakedownKey(key: string): Promise<void> {
  await call(`/values/${encodeURIComponent(key)}`, { method: "DELETE" });
}

export async function putTakedownKeys(pairs: Array<{ key: string; value: string }>): Promise<void> {
  for (let i = 0; i < pairs.length; i += KV_BULK_BATCH) {
    await call("/bulk", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pairs.slice(i, i + KV_BULK_BATCH)),
    });
  }
}

export async function deleteTakedownKeys(keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += KV_BULK_BATCH) {
    await call("/bulk/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(keys.slice(i, i + KV_BULK_BATCH)),
    });
  }
}
