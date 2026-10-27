/**
 * Media processor Worker (Build Board #20, content system PR 4, spec 3.5).
 *
 * Queue consumer for `content-ingest` and its dead letter queue. The API publishes
 * `{ type, publicId }` after completeUpload (R2 files) and after the Stream webhook
 * reports a video ready. This Worker asks the API for the job, runs the steps with
 * the toolbox container, and reports each step back. It has no public route.
 * Handoff: docs/fixes/content-media-processor.md.
 */
import { parseContentQueueMessage } from "@repo/constants/src/contentJob";
import { createClassifier, createCsamMatcher } from "./adapters";
import { createApi } from "./api";
import { failDeadLetter, processMessage, type Deps } from "./pipeline";
import { createContainerToolbox } from "./toolbox";

export { ContainerProxy } from "@cloudflare/containers";
export { ProcessorContainer } from "./container";

export function depsFromEnv(env: Env): Deps {
  return {
    bucket: env.CONTENT,
    api: createApi(env.API_ORIGIN, env.CONTENT_PROCESSOR_SECRET),
    toolbox: createContainerToolbox(env),
    csam: createCsamMatcher(env.CSAM_MATCHER),
    classifier: createClassifier(env.CLASSIFIER),
    classifierRequired: env.CLASSIFIER_REQUIRED === "true",
    secret: env.CONTENT_PROCESSOR_SECRET,
    fetchImage: url => fetch(url, { signal: AbortSignal.timeout(30_000) }),
  };
}

/** 1, 2 then 4 minutes, so a short outage of the API or Stream clears itself. */
export function retryDelaySeconds(attempts: number): number {
  return Math.min(600, 60 * 2 ** Math.max(0, attempts - 1));
}

export function createQueueHandler(makeDeps: (env: Env) => Deps) {
  return async (batch: MessageBatch<unknown>, env: Env): Promise<void> => {
    if (!env.CONTENT_PROCESSOR_SECRET) {
      // Misconfigured: keep the messages for when the secret is set
      console.error(JSON.stringify({ event: "processor.no_secret" }));
      batch.retryAll({ delaySeconds: 300 });
      return;
    }
    const deps = makeDeps(env);
    const deadLetter = batch.queue.endsWith("-dlq");
    for (const message of batch.messages) {
      const body = parseContentQueueMessage(message.body);
      if (!body) {
        console.error(JSON.stringify({ event: "processor.invalid_message", id: message.id }));
        message.ack();
        continue;
      }
      const started = Date.now();
      try {
        const outcome = deadLetter
          ? await failDeadLetter(body, deps)
          : await processMessage(body, deps);
        console.log(
          JSON.stringify({
            event: "processor.message",
            publicId: body.publicId,
            type: body.type,
            outcome,
            attempts: message.attempts,
            ms: Date.now() - started,
          })
        );
        message.ack();
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "processor.retry",
            publicId: body.publicId,
            attempts: message.attempts,
            deadLetter,
            error: error instanceof Error ? error.message : String(error),
          })
        );
        message.retry({ delaySeconds: retryDelaySeconds(message.attempts) });
      }
    }
  };
}

export default {
  async fetch(): Promise<Response> {
    return new Response(null, { status: 404 });
  },
  queue: createQueueHandler(depsFromEnv),
} satisfies ExportedHandler<Env>;
