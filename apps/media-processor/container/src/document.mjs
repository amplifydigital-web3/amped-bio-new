/**
 * Documents (spec 3.5 step 3.4).
 *
 * PDF: the document info dictionary and the catalog XMP stream are removed with
 * qpdf (author, producer, creation tool, edit history in XMP). The cleaned file is
 * the original we keep, at originals/{id}/original.pdf. Pages 1 to 3 are rendered
 * with poppler's pdftoppm as PAGE_PREVIEW (WebP, 1280 px wide). Page 1 is also the
 * COVER and the blur cover. A PDF that needs a password to open is refused.
 *
 * EPUB: kept as uploaded. The cover image named in the package file is rendered as
 * COVER and blur. An EPUB without a cover still processes.
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, posix } from "node:path";
import sharp from "sharp";
import { ContentError } from "./errors.mjs";
import { decodeImageFile, renderImageSet } from "./image.mjs";
import { download, upload } from "./r2.mjs";
import { run, ToolError } from "./run.mjs";

export const PAGE_PREVIEWS = 3;
export const PAGE_PREVIEW_WIDTH = 1280;
const COVER_BYTES_MAX = 50 * 1024 * 1024;

async function pdfPageCount(path) {
  try {
    const { stdout } = await run("pdfinfo", [path], { timeoutMs: 60_000 });
    const match = /^Pages:\s+(\d+)/m.exec(stdout);
    return match ? Number(match[1]) : 0;
  } catch (error) {
    if (error instanceof ToolError && /password/i.test(error.stderr)) {
      throw new ContentError("pdf_encrypted");
    }
    throw new ContentError("pdf_unreadable");
  }
}

async function qpdfJson(path, objectRef) {
  const { stdout } = await run(
    "qpdf",
    [path, "--json-output=2", "--json-key=qpdf", `--json-object=${objectRef}`],
    { timeoutMs: 120_000, okCodes: [0, 3] }
  );
  const [, objects] = JSON.parse(stdout).qpdf;
  return objects;
}

/**
 * Removes /Info from the trailer and /Metadata from the catalog. qpdf drops the
 * objects no longer referenced when it writes the new file. Works with qpdf 11
 * (Debian bookworm), which has no single flag for this.
 */
export async function stripPdfMetadata(source, target, workDir) {
  const trailer = (await qpdfJson(source, "trailer")).trailer.value;
  const rootRef = trailer["/Root"];
  if (typeof rootRef !== "string") throw new ContentError("pdf_unreadable");
  const root = (await qpdfJson(source, rootRef))[`obj:${rootRef}`].value;

  const nextTrailer = { ...trailer };
  delete nextTrailer["/Info"];
  const nextRoot = { ...root };
  delete nextRoot["/Metadata"];

  const update = join(workDir, "strip.json");
  await writeFile(
    update,
    JSON.stringify({
      qpdf: [
        { jsonversion: 2, pushedinheritedpageresources: false, calledgetallpages: false },
        { trailer: { value: nextTrailer }, [`obj:${rootRef}`]: { value: nextRoot } },
      ],
    })
  );
  await run("qpdf", [source, target, `--update-from-json=${update}`], {
    timeoutMs: 300_000,
    okCodes: [0, 3],
  });
}

async function processPdf(job, workDir, source) {
  const pageCount = await pdfPageCount(source);
  if (!pageCount) throw new ContentError("pdf_unreadable");

  const clean = join(workDir, "clean.pdf");
  try {
    await stripPdfMetadata(source, clean, workDir);
  } catch (error) {
    if (error instanceof ContentError) throw error;
    if (error instanceof ToolError || error instanceof SyntaxError) {
      throw new ContentError("pdf_unreadable");
    }
    throw error;
  }
  const original = {
    role: "ORIGINAL",
    storage: "R2",
    r2Key: job.originalKey,
    mimeType: "application/pdf",
    size: await upload(job, job.originalKey, clean, "application/pdf"),
  };

  const pagesDir = join(workDir, "pages");
  await mkdir(pagesDir, { recursive: true });
  const last = Math.min(PAGE_PREVIEWS, pageCount);
  try {
    await run(
      "pdftoppm",
      [
        "-f",
        "1",
        "-l",
        String(last),
        "-scale-to",
        String(PAGE_PREVIEW_WIDTH),
        "-png",
        clean,
        join(pagesDir, "page"),
      ],
      { timeoutMs: 180_000 }
    );
  } catch {
    throw new ContentError("pdf_unreadable");
  }
  const rendered = (await readdir(pagesDir)).filter(name => name.endsWith(".png")).sort();

  const assets = [];
  const frames = [];
  for (const [index, name] of rendered.entries()) {
    const page = index + 1;
    const file = join(workDir, `page-${page}.webp`);
    const info = await sharp(join(pagesDir, name)).webp({ quality: 80 }).toFile(file);
    const key = `${job.derivedPrefix}page/${page}.webp`;
    assets.push({
      role: "PAGE_PREVIEW",
      storage: "R2",
      r2Key: key,
      variant: `p${page}`,
      mimeType: "image/webp",
      size: await upload(job, key, file, "image/webp"),
      width: info.width,
      height: info.height,
      scanStatus: "SKIPPED",
    });
    frames.push(key);
  }

  let blur = null;
  if (rendered[0]) {
    const cover = await decodeImageFile(join(pagesDir, rendered[0]), "png");
    const set = await renderImageSet(job, cover, workDir, "COVER", "cover");
    assets.push(...set.assets);
    blur = set.blur;
  }
  return { ok: true, pageCount, assets, blur, original, frames };
}

async function unzipEntry(archive, entry, maxBytes) {
  const chunks = [];
  let total = 0;
  await run("unzip", ["-p", archive, entry], {
    timeoutMs: 60_000,
    onStdout: chunk => {
      total += chunk.length;
      if (total <= maxBytes) chunks.push(chunk);
    },
  });
  if (total > maxBytes) throw new ContentError("epub_entry_too_large");
  return Buffer.concat(chunks);
}

function attribute(tag, name) {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
  return match ? (match[2] ?? match[3] ?? "") : null;
}

/** The cover image path inside the EPUB, from container.xml and the package file. */
export async function epubCoverPath(archive) {
  const container = (await unzipEntry(archive, "META-INF/container.xml", 1024 * 1024)).toString(
    "utf8"
  );
  const rootfile = /<rootfile\b[^>]*>/i.exec(container);
  const opfPath = rootfile ? attribute(rootfile[0], "full-path") : null;
  if (!opfPath) return null;
  const opf = (await unzipEntry(archive, opfPath, 5 * 1024 * 1024)).toString("utf8");
  const items = opf.match(/<item\b[^>]*>/gi) ?? [];
  let href = null;
  for (const item of items) {
    if ((attribute(item, "properties") ?? "").split(/\s+/).includes("cover-image")) {
      href = attribute(item, "href");
      break;
    }
  }
  if (!href) {
    const meta = (opf.match(/<meta\b[^>]*>/gi) ?? []).find(
      tag => attribute(tag, "name") === "cover"
    );
    const id = meta ? attribute(meta, "content") : null;
    const item = id ? items.find(tag => attribute(tag, "id") === id) : null;
    href = item ? attribute(item, "href") : null;
  }
  if (!href) return null;
  const resolved = posix.normalize(posix.join(posix.dirname(opfPath), decodeURIComponent(href)));
  return resolved.startsWith("..") ? null : resolved;
}

async function processEpub(job, workDir, source) {
  const original = {
    role: "ORIGINAL",
    storage: "R2",
    r2Key: job.originalKey,
    mimeType: "application/epub+zip",
    size: await upload(job, job.originalKey, source, "application/epub+zip"),
  };
  let coverPath = null;
  try {
    coverPath = await epubCoverPath(source);
  } catch (error) {
    if (error instanceof ContentError) throw error;
    throw new ContentError("epub_unreadable");
  }
  if (!coverPath) return { ok: true, assets: [], blur: null, original, frames: [] };

  const coverFile = join(workDir, "cover-source");
  try {
    await writeFile(coverFile, await unzipEntry(source, coverPath, COVER_BYTES_MAX));
  } catch (error) {
    if (error instanceof ContentError) throw error;
    return { ok: true, assets: [], blur: null, original, frames: [] };
  }
  const ext = coverPath.split(".").pop()?.toLowerCase() ?? "";
  const cover = await decodeImageFile(coverFile, ext);
  const set = await renderImageSet(job, cover, workDir, "COVER", "cover");
  return { ok: true, assets: set.assets, blur: set.blur, original, frames: [set.frame] };
}

export async function processDocument(job, workDir) {
  const source = join(workDir, `source.${job.ext}`);
  await download(job, job.source, source);
  if (job.ext === "pdf") return processPdf(job, workDir, source);
  if (job.ext === "epub") return processEpub(job, workDir, source);
  throw new ContentError("document_unsupported");
}
