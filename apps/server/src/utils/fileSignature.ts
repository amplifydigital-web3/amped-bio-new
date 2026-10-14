/**
 * File signature ("magic bytes") detection for uploads.
 *
 * The browser tells us a file's type, but that value comes from the file name
 * and can be anything. After an upload lands in storage we read its first few
 * KB and check the real type here. See docs/fixes/uploads-sdk-v3-validation.md.
 *
 * Only the types our upload flows accept are recognised. Anything else returns
 * null and the upload is rejected.
 */

/** How many bytes the confirm step reads from the start of an object. */
export const FILE_SIGNATURE_BYTES = 4096;

/** Collapse aliases so "image/jpg" and "image/jpeg" compare equal. */
export function normalizeMimeType(mime: string | null | undefined): string {
  const base = (mime ?? "").split(";")[0]!.trim().toLowerCase();
  if (base === "image/jpg" || base === "image/pjpeg") return "image/jpeg";
  if (base === "video/avi" || base === "video/msvideo") return "video/x-msvideo";
  return base;
}

/**
 * MP4 and QuickTime are the same container (ISO base media). Phones label the
 * same recording either way, so the two are treated as one family when the
 * declared type is compared with the detected one.
 */
const FAMILIES: Record<string, string> = {
  "video/mp4": "iso-bmff",
  "video/quicktime": "iso-bmff",
};

function family(mime: string): string {
  const normalized = normalizeMimeType(mime);
  return FAMILIES[normalized] ?? normalized;
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, Math.min(end, bytes.length)));
}

const QUICKTIME_BRANDS = new Set(["qt  "]);

function detectIsoBmff(bytes: Uint8Array): string | null {
  // Box size (4 bytes) then "ftyp" then the major brand (4 bytes).
  if (bytes.length < 12 || ascii(bytes, 4, 8) !== "ftyp") return null;
  const brand = ascii(bytes, 8, 12);
  if (QUICKTIME_BRANDS.has(brand)) return "video/quicktime";
  // HEIC and AVIF also use ftyp. They are not accepted anywhere yet.
  if (["heic", "heix", "mif1", "msf1", "avif", "avis"].includes(brand)) return null;
  return "video/mp4";
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  // Binary files contain NUL bytes in the first few KB; SVG is text.
  if (bytes.includes(0)) return false;
  let text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  text = text.trimStart();
  if (!text.startsWith("<")) return false;
  // Allow an XML prolog, comments and a DOCTYPE before the root element.
  return /<svg[\s>]/i.test(text);
}

/**
 * Detect the real type of a file from its first bytes.
 * Returns a normalized MIME type, or null when the bytes match nothing we accept.
 */
export function detectFileType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return "image/gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "AVI ") return "video/x-msvideo";
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
  const iso = detectIsoBmff(bytes);
  if (iso) return iso;
  if (looksLikeSvg(bytes)) return "image/svg+xml";
  return null;
}

export type SignatureCheck =
  | { ok: true; detectedType: string }
  | { ok: false; detectedType: string | null; reason: "unknown_type" | "not_allowed" | "mismatch" };

/**
 * Check the first bytes of an uploaded file against the type the client
 * declared and the types the upload flow allows.
 */
export function checkFileSignature(
  bytes: Uint8Array,
  declaredType: string,
  allowedTypes: readonly string[]
): SignatureCheck {
  const detectedType = detectFileType(bytes);
  if (!detectedType) return { ok: false, detectedType, reason: "unknown_type" };

  const allowed = allowedTypes.map(normalizeMimeType);
  if (!allowed.includes(detectedType)) return { ok: false, detectedType, reason: "not_allowed" };

  if (family(detectedType) !== family(declaredType)) {
    return { ok: false, detectedType, reason: "mismatch" };
  }
  return { ok: true, detectedType };
}
