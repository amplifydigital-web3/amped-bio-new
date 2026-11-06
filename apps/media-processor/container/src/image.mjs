/**
 * Images (spec 3.5 step 3.4 and 3.5). sharp re-encodes every image, so EXIF, GPS,
 * XMP and IPTC never reach a viewer: sharp writes no metadata unless asked, and we
 * never ask. Orientation is applied first. The longest side is capped at 4096.
 * Renditions: 320, 640, 1280 and full, each in WebP and JPEG. Plus a 32 px blur
 * cover for locked cards. HEIC goes through heif-convert first. GIFs keep their
 * first frame only.
 *
 * mode "item": an image item, renditions are RENDITION.
 * mode "poster": a video poster frame from Stream, renditions are COVER.
 */
import { join } from "node:path";
import sharp from "sharp";
import { run } from "./run.mjs";
import { ContentError } from "./errors.mjs";
import { download, upload } from "./r2.mjs";

export const IMAGE_WIDTHS = [320, 640, 1280];
export const IMAGE_MAX_SIDE = 4096;
export const BLUR_WIDTH = 32;
/** About 100 megapixels. Anything larger is refused before decoding. */
const PIXEL_LIMIT = 100_000_000;

sharp.cache(false);
sharp.concurrency(1);

async function decodeSource(path, ext) {
  let input = path;
  if (ext === "heic" || ext === "heif") {
    input = `${path}.png`;
    try {
      await run("heif-convert", [path, input], { timeoutMs: 60_000 });
    } catch {
      throw new ContentError("image_unreadable");
    }
  }
  try {
    const { data, info } = await sharp(input, { limitInputPixels: PIXEL_LIMIT, failOn: "error" })
      .rotate()
      .resize({
        width: IMAGE_MAX_SIDE,
        height: IMAGE_MAX_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toColourspace("srgb")
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/pixel limit/i.test(message)) throw new ContentError("image_too_large");
    throw new ContentError("image_unreadable");
  }
}

function fromRaw(image) {
  return sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } });
}

/**
 * Writes the renditions and the blur cover for one decoded image.
 * @returns {Promise<{ assets: object[], blur: object, frame: string }>}
 */
export async function renderImageSet(job, image, workDir, role, folder) {
  const assets = [];
  const widths = [...IMAGE_WIDTHS.filter(width => width < image.width), "full"];
  let frame = "";
  for (const width of widths) {
    const resized =
      width === "full"
        ? fromRaw(image)
        : fromRaw(image).resize({ width, withoutEnlargement: true });
    for (const format of ["webp", "jpg"]) {
      const file = join(workDir, `${folder}-${width}.${format}`);
      const pipeline =
        format === "webp"
          ? resized.clone().webp({ quality: 80 })
          : resized.clone().flatten({ background: "#ffffff" }).jpeg({ quality: 82, mozjpeg: true });
      const info = await pipeline.toFile(file);
      const key = `${job.derivedPrefix}${folder}/${width}.${format}`;
      const size = await upload(job, key, file, format === "webp" ? "image/webp" : "image/jpeg");
      assets.push({
        role,
        storage: "R2",
        r2Key: key,
        variant: `${width}.${format}`,
        mimeType: format === "webp" ? "image/webp" : "image/jpeg",
        size,
        width: info.width,
        height: info.height,
        scanStatus: "SKIPPED",
      });
      // The CSAM matcher and the classifier read one mid size JPEG
      if (format === "jpg" && (width === 640 || (width === "full" && !frame))) frame = key;
    }
  }

  const blurFile = join(workDir, `${folder}-blur.webp`);
  const blurInfo = await fromRaw(image)
    .resize({ width: BLUR_WIDTH })
    .blur(1)
    .webp({ quality: 50 })
    .toFile(blurFile);
  const blurKey = `${job.derivedPrefix}blur/${BLUR_WIDTH}.webp`;
  const blur = {
    role: "BLUR",
    storage: "R2",
    r2Key: blurKey,
    variant: `${BLUR_WIDTH}.webp`,
    mimeType: "image/webp",
    size: await upload(job, blurKey, blurFile, "image/webp"),
    width: blurInfo.width,
    height: blurInfo.height,
    scanStatus: "SKIPPED",
  };
  return { assets, blur, frame };
}

/** Decodes a local image file. Exported for the document cover path. */
export const decodeImageFile = decodeSource;

export async function processImage(job, workDir) {
  const source = join(workDir, "source");
  await download(job, job.source, source);
  const image = await decodeSource(source, job.ext);
  const role = job.mode === "poster" ? "COVER" : "RENDITION";
  const folder = job.mode === "poster" ? "cover" : "rendition";
  const { assets, blur, frame } = await renderImageSet(job, image, workDir, role, folder);
  return { ok: true, width: image.width, height: image.height, assets, blur, frames: [frame] };
}
