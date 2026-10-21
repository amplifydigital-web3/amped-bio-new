/**
 * Malware scan (spec 3.5 step 3.3, decision 12) for documents, files and any item
 * with downloads allowed.
 *
 * 1. Archives (zip, epub) are checked from their central directory first: more
 *    than 10 times expansion or more than 2 GB uncompressed fails the item.
 * 2. ClamAV scans the file. In the image clamd runs with the limits in clamd.conf
 *    and `clamdscan --fdpass` hands it the open file. Tests run `clamscan` with a
 *    test signature database (CLAMAV_MODE=clamscan, CLAMAV_DB=dir).
 *
 * Verdicts: clean, infected (with the signature name), or a failure reason when the
 * file could not be fully scanned (encrypted archive, over the scan limits). A file
 * we could not scan is never published.
 */
import { access, stat } from "node:fs/promises";
import { join } from "node:path";
import { ContentError } from "./errors.mjs";
import { download } from "./r2.mjs";
import { run, ToolError } from "./run.mjs";

export const ARCHIVE_MAX_RATIO = 10;
export const ARCHIVE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const ARCHIVE_EXTS = new Set(["zip", "epub"]);

/** Same limits as clamd.conf, for clamscan in tests and local runs. */
const CLAMSCAN_LIMITS = [
  "--max-filesize=600M",
  "--max-scansize=2000M",
  "--max-recursion=16",
  "--max-files=20000",
  "--alert-exceeds-max=yes",
  "--alert-encrypted-archive=yes",
  "--alert-encrypted-doc=yes",
];

export async function checkArchive(path) {
  let summary;
  try {
    const { stdout } = await run("unzip", ["-Zt", path], { timeoutMs: 60_000 });
    summary = stdout.trim().split("\n").pop() ?? "";
  } catch {
    throw new ContentError("archive_corrupt");
  }
  const match = /(\d+) files?, (\d+) bytes? uncompressed/.exec(summary);
  if (!match) throw new ContentError("archive_corrupt");
  const uncompressed = Number(match[2]);
  const size = (await stat(path)).size;
  if (uncompressed > ARCHIVE_MAX_BYTES) throw new ContentError("archive_too_large");
  if (size > 0 && uncompressed / size > ARCHIVE_MAX_RATIO) throw new ContentError("archive_ratio");
  return { files: Number(match[1]), uncompressed };
}

/** clamd loads its database for 20 to 40 seconds after a cold start. */
async function waitForClamd(timeoutMs = 90_000) {
  const socket = process.env.CLAMD_SOCKET || "/run/clamav/clamd.ctl";
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await access(socket);
      return;
    } catch {
      if (Date.now() > deadline) throw new Error("clamd not ready");
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

function clamCommand(path) {
  if (process.env.CLAMAV_MODE === "clamscan") {
    const db = process.env.CLAMAV_DB ? [`--database=${process.env.CLAMAV_DB}`] : [];
    return [
      "clamscan",
      ["--no-summary", "--infected", "--stdout", ...db, ...CLAMSCAN_LIMITS, path],
    ];
  }
  const config = process.env.CLAMD_CONFIG ? [`--config-file=${process.env.CLAMD_CONFIG}`] : [];
  return ["clamdscan", [...config, "--fdpass", "--no-summary", "--infected", "--stdout", path]];
}

/** @returns {Promise<{ verdict: "clean" } | { verdict: "infected", signature: string }>} */
export async function clamScan(path) {
  if (process.env.CLAMAV_MODE !== "clamscan") await waitForClamd();
  const [command, args] = clamCommand(path);
  let result;
  try {
    result = await run(command, args, { timeoutMs: 10 * 60_000, okCodes: [0, 1] });
  } catch (error) {
    // Exit 2 is a scanner fault (database, daemon). Transient: the Queue retries.
    if (error instanceof ToolError) throw new Error(`clamav error: ${error.message}`);
    throw error;
  }
  if (result.code === 0) return { verdict: "clean" };
  const found = /: (\S+) FOUND$/m.exec(result.stdout);
  const signature = found?.[1] ?? "unknown";
  if (signature.startsWith("Heuristics.Limits.Exceeded")) throw new ContentError("scan_limits");
  if (signature.startsWith("Heuristics.Encrypted")) throw new ContentError("archive_encrypted");
  return { verdict: "infected", signature };
}

export async function processScan(job, workDir) {
  const source = join(workDir, "source");
  await download(job, job.source, source);
  if (ARCHIVE_EXTS.has(job.ext)) await checkArchive(source);
  const verdict = await clamScan(source);
  return { ok: true, ...verdict };
}
