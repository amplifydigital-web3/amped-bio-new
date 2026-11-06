/** What one row of the upload dialog says: stage, tone and the line under the name. */
import { CONTENT_COPY } from "../copy";
import { formatBytes } from "./files";
import { failureLine } from "./status";
import type { UploadEntry } from "./uploadQueue";

type RowStage = keyof typeof CONTENT_COPY.upload.stage;

/** The stage, pill tone and line for one row (cs2, cs8). */
export function rowView(entry: UploadEntry): {
  stage: RowStage;
  tone: "progress" | "ready" | "review" | "danger" | "draft";
  line: string;
  error: boolean;
} {
  const s = CONTENT_COPY.upload;
  const size = formatBytes(entry.size);
  if (entry.rejected) return { stage: "failed", tone: "danger", line: entry.rejected, error: true };
  const server = entry.server;
  if (server) {
    if (server.status === "blocked" || server.moderationState === "blocked") {
      return { stage: "blocked", tone: "danger", line: s.line.blocked, error: true };
    }
    if (server.status === "failed") {
      return {
        stage: "failed",
        tone: "danger",
        line: failureLine(server.failureReason),
        error: true,
      };
    }
    if (server.status === "ready") {
      return server.moderationState === "held"
        ? { stage: "review", tone: "review", line: s.line.review, error: false }
        : { stage: "ready", tone: "ready", line: s.line.ready(size), error: false };
    }
  }
  const upload = entry.upload;
  if (!upload) return { stage: "waiting", tone: "draft", line: s.line.waiting(size), error: false };
  const pct = Math.floor((upload.loaded / Math.max(1, upload.total)) * 100);
  switch (upload.phase) {
    case "waiting":
      return { stage: "waiting", tone: "draft", line: s.line.waiting(size), error: false };
    case "preparing":
      return { stage: "preparing", tone: "progress", line: s.line.preparing(size), error: false };
    case "uploading":
      return { stage: "uploading", tone: "progress", line: s.line.uploading(pct), error: false };
    case "paused":
    case "offline":
      return {
        stage: upload.phase,
        tone: "review",
        line: s.line.paused(pct, formatBytes(upload.loaded), formatBytes(upload.total)),
        error: false,
      };
    case "finishing":
      return { stage: "finishing", tone: "progress", line: s.line.finishing, error: false };
    case "processing":
      return {
        stage: "processing",
        tone: "progress",
        line:
          server?.processingStep === "encoding" || entry.kind === "video"
            ? s.line.encoding(size)
            : s.line.processing(size),
        error: false,
      };
    case "failed":
      return {
        stage: "failed",
        tone: "danger",
        line: upload.error ?? CONTENT_COPY.errors.generic,
        error: true,
      };
  }
}
