/**
 * Publishes processing jobs to the `content-ingest` Queue (Build Board #20, PR 4,
 * spec 3.5 step 3) through the Queues HTTP API, so the API needs no Worker binding.
 *
 * POST /accounts/{account}/queues/{queue_id}/messages  { "body": {...} }
 * Token permission: Queues Edit, on this account only.
 * Docs (checked 17 Oct 2026): https://developers.cloudflare.com/queues/examples/publish-to-a-queue-via-http/
 */
import type { ContentQueueMessage } from "@repo/constants";
import { env } from "../../env";

const API = "https://api.cloudflare.com/client/v4";
const REQUEST_TIMEOUT_MS = 10_000;
const ATTEMPTS = 3;

export class QueuePublishError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "QueuePublishError";
  }
}

export function contentQueueConfigured(): boolean {
  return Boolean(env.CF_ACCOUNT_ID && env.CF_QUEUES_API_TOKEN && env.CF_CONTENT_QUEUE_ID);
}

/**
 * Sends one message, retrying twice on a network error or a 5xx. A 4xx is a
 * configuration fault (token, queue id) and is not retried.
 */
export async function publishContentJob(
  message: ContentQueueMessage,
  sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))
): Promise<void> {
  if (!contentQueueConfigured()) throw new QueuePublishError("Content queue is not configured", 0);
  const url = `${API}/accounts/${env.CF_ACCOUNT_ID}/queues/${env.CF_CONTENT_QUEUE_ID}/messages`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CF_QUEUES_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: message }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) return;
      const error = new QueuePublishError(
        `Queue publish failed: ${response.status}`,
        response.status
      );
      if (response.status < 500) throw error;
      lastError = error;
    } catch (error) {
      if (error instanceof QueuePublishError && error.status > 0 && error.status < 500) throw error;
      lastError = error;
    }
    if (attempt < ATTEMPTS) await sleep(250 * attempt);
  }
  throw lastError instanceof Error ? lastError : new QueuePublishError("Queue publish failed", 0);
}
