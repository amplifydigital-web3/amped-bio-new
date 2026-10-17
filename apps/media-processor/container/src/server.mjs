/**
 * Media toolbox (Build Board #20, content system PR 4, spec 3.5).
 *
 * Runs inside the Cloudflare Container that the processor Worker drives. It has no
 * internet and no credentials. The Worker posts one JSON request per step:
 *
 *   POST /scan       ClamAV, and archive limits for zip and epub
 *   POST /image      renditions and blur (an image item, or a video poster)
 *   POST /audio      AAC m4a, preview cut, waveform
 *   POST /document   PDF metadata removal and page previews, EPUB cover
 *   GET  /health
 *
 * Request: { publicId, grant, source, ext, mimeType, derivedPrefix, audioPrefix,
 *            originalKey, previewSeconds, mode }
 * Answer 200 { ok: true, ... } on success, 200 { ok: false, reason } when the file
 * itself is the problem (never retried), 500 for anything else (the Queue retries).
 * Files are read from and written to R2 through the Worker (see r2.mjs).
 */
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { processAudio } from "./audio.mjs";
import { processDocument } from "./document.mjs";
import { ContentError } from "./errors.mjs";
import { processImage } from "./image.mjs";
import { SourceMissingError } from "./r2.mjs";
import { processScan } from "./scan.mjs";

const PORT = Number(process.env.PORT || 8080);
const BODY_LIMIT = 64 * 1024;
/** Jobs run one at a time per instance by default: ffmpeg and ClamAV are memory heavy */
const MAX_JOBS = Math.max(1, Number(process.env.MAX_JOBS || 1));

const handlers = {
  "/scan": processScan,
  "/image": processImage,
  "/audio": processAudio,
  "/document": processDocument,
};

let running = 0;
const waiting = [];
async function slot() {
  if (running < MAX_JOBS) {
    running += 1;
    return;
  }
  await new Promise(resolve => waiting.push(resolve));
}
function release() {
  const next = waiting.shift();
  if (next) next();
  else running -= 1;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > BODY_LIMIT) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

const ID = /^[a-z0-9]{16}$/;

export function validJob(job) {
  return (
    job &&
    typeof job === "object" &&
    ID.test(job.publicId) &&
    typeof job.grant === "string" &&
    typeof job.source === "string" &&
    job.source.startsWith(`incoming/${job.publicId}/`) &&
    (job.ext === undefined || /^[a-z0-9]{0,8}$/.test(job.ext))
  );
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export async function handle(path, job) {
  const handler = handlers[path];
  if (!handler) return { status: 404, body: { error: "not_found" } };
  if (!validJob(job)) return { status: 400, body: { error: "invalid_job" } };
  await slot();
  const workDir = await mkdtemp(join(tmpdir(), "job-"));
  const started = Date.now();
  try {
    const result = await handler(job, workDir);
    log("done", { path, publicId: job.publicId, ms: Date.now() - started });
    return { status: 200, body: result };
  } catch (error) {
    if (error instanceof ContentError) {
      log("refused", { path, publicId: job.publicId, reason: error.reason });
      return { status: 200, body: { ok: false, reason: error.reason } };
    }
    if (error instanceof SourceMissingError) {
      return { status: 200, body: { ok: false, reason: "source_missing" } };
    }
    log("error", { path, publicId: job.publicId, error: String(error?.message ?? error) });
    return { status: 500, body: { error: "internal" } };
  } finally {
    await rm(workDir, { recursive: true, force: true });
    release();
  }
}

function log(event, fields) {
  console.log(JSON.stringify({ event: `toolbox.${event}`, ...fields }));
}

export function createToolboxServer() {
  return createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
      if (req.method !== "POST") return send(res, 405, { error: "method" });
      let job;
      try {
        job = JSON.parse(await readBody(req));
      } catch {
        return send(res, 400, { error: "invalid_json" });
      }
      const { status, body } = await handle(req.url ?? "", job);
      return send(res, status, body);
    } catch (error) {
      log("error", { error: String(error?.message ?? error) });
      if (!res.headersSent) send(res, 500, { error: "internal" });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createToolboxServer().listen(PORT, () => log("listening", { port: PORT }));
}
