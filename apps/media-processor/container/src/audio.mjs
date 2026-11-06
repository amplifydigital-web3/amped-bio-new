/**
 * Audio (spec 3.5 step 3.4). ffmpeg re-encodes the first audio stream to AAC in
 * m4a at 160 kbps. Every tag, chapter and embedded picture is dropped
 * (`-map_metadata -1`, `-map_chapters -1`, video, subtitle and data streams not
 * mapped). Outputs:
 *   audio/{id}/full.m4a        RENDITION, variant "m4a"
 *   audio/{id}/preview.m4a     AUDIO_PREVIEW, the first previewSeconds, when set
 *   derived/{id}/waveform/peaks.json   WAVEFORM, 1000 peaks from 0 to 1
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ContentError } from "./errors.mjs";
import { download, upload } from "./r2.mjs";
import { run, ToolError } from "./run.mjs";

export const AUDIO_BITRATE = "160k";
export const WAVEFORM_PEAKS = 1000;
const WAVEFORM_RATE = 4000;
/** Twice the 4 hour video cap. Longer audio is refused. */
const MAX_DURATION_MS = 8 * 60 * 60 * 1000;

export async function probeDurationMs(path) {
  try {
    const { stdout } = await run(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
      { timeoutMs: 60_000 }
    );
    const seconds = Number.parseFloat(stdout.trim());
    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0;
  } catch {
    return 0;
  }
}

/**
 * Peaks over the decoded mono signal, streamed so a long file never sits in memory.
 * @returns {Promise<number[]>}
 */
export async function waveformPeaks(path, durationMs, count = WAVEFORM_PEAKS) {
  const totalSamples = Math.max(1, Math.ceil((durationMs / 1000) * WAVEFORM_RATE));
  const perBucket = Math.max(1, Math.ceil(totalSamples / count));
  const peaks = new Array(count).fill(0);
  let sample = 0;
  let carry = null;
  await run(
    "ffmpeg",
    [
      "-nostdin",
      "-v",
      "error",
      "-i",
      path,
      "-ac",
      "1",
      "-ar",
      String(WAVEFORM_RATE),
      "-f",
      "s16le",
      "-",
    ],
    {
      timeoutMs: 15 * 60_000,
      onStdout: chunk => {
        let data = chunk;
        if (carry) {
          data = Buffer.concat([carry, chunk]);
          carry = null;
        }
        const usable = data.length - (data.length % 2);
        if (usable < data.length) carry = data.subarray(usable);
        for (let offset = 0; offset < usable; offset += 2) {
          const bucket = Math.min(count - 1, Math.floor(sample / perBucket));
          const value = Math.abs(data.readInt16LE(offset)) / 32768;
          if (value > peaks[bucket]) peaks[bucket] = value;
          sample += 1;
        }
      },
    }
  );
  return peaks.map(peak => Math.round(peak * 1000) / 1000);
}

export async function processAudio(job, workDir) {
  const source = join(workDir, "source");
  await download(job, job.source, source);
  const sourceDuration = await probeDurationMs(source);
  if (!sourceDuration) throw new ContentError("audio_unreadable");
  if (sourceDuration > MAX_DURATION_MS) throw new ContentError("audio_too_long");

  const full = join(workDir, "full.m4a");
  try {
    await run(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-y",
        "-i",
        source,
        "-map",
        "0:a:0",
        "-vn",
        "-sn",
        "-dn",
        "-map_metadata",
        "-1",
        "-map_chapters",
        "-1",
        "-c:a",
        "aac",
        "-b:a",
        AUDIO_BITRATE,
        "-ac",
        "2",
        "-ar",
        "44100",
        "-movflags",
        "+faststart",
        "-f",
        "mp4",
        full,
      ],
      { timeoutMs: 30 * 60_000 }
    );
  } catch (error) {
    if (error instanceof ToolError) throw new ContentError("audio_unreadable");
    throw error;
  }
  const durationMs = (await probeDurationMs(full)) || sourceDuration;

  const assets = [];
  const fullKey = `${job.audioPrefix}full.m4a`;
  assets.push({
    role: "RENDITION",
    storage: "R2",
    r2Key: fullKey,
    variant: "m4a",
    mimeType: "audio/mp4",
    size: await upload(job, fullKey, full, "audio/mp4"),
    durationMs,
    scanStatus: "SKIPPED",
  });

  if (job.previewSeconds && job.previewSeconds > 0) {
    const previewMs = Math.min(job.previewSeconds * 1000, durationMs);
    const preview = join(workDir, "preview.m4a");
    await run(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-y",
        "-i",
        full,
        "-t",
        String(previewMs / 1000),
        "-map_metadata",
        "-1",
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        "-f",
        "mp4",
        preview,
      ],
      { timeoutMs: 5 * 60_000 }
    );
    const previewKey = `${job.audioPrefix}preview.m4a`;
    assets.push({
      role: "AUDIO_PREVIEW",
      storage: "R2",
      r2Key: previewKey,
      mimeType: "audio/mp4",
      size: await upload(job, previewKey, preview, "audio/mp4"),
      durationMs: (await probeDurationMs(preview)) || previewMs,
      scanStatus: "SKIPPED",
    });
  }

  const peaks = await waveformPeaks(full, durationMs);
  const waveform = join(workDir, "peaks.json");
  await writeFile(waveform, JSON.stringify({ version: 1, peaks }));
  const waveformKey = `${job.derivedPrefix}waveform/peaks.json`;
  assets.push({
    role: "WAVEFORM",
    storage: "R2",
    r2Key: waveformKey,
    mimeType: "application/json",
    size: await upload(job, waveformKey, waveform, "application/json"),
    scanStatus: "SKIPPED",
  });

  return { ok: true, durationMs, assets };
}
