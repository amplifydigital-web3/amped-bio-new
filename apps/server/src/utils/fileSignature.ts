/**
 * File signature ("magic bytes") detection for uploads.
 *
 * The browser tells us a file's type, but that value comes from the file name
 * and can be anything. After an upload lands in storage we read its first few
 * KB and check the real type here. See docs/fixes/uploads-sdk-v3-validation.md.
 *
 * Only the types our upload flows accept are recognised: images, video and SVG
 * for the profile and theme flows (PR 1), plus audio, PDF, EPUB and ZIP for the
 * content system (PR 2). Anything else returns null and the upload is rejected.
 */

/** How many bytes the confirm step reads from the start of an object. */
export const FILE_SIGNATURE_BYTES = 4096;

/** Collapse aliases so "image/jpg" and "image/jpeg" compare equal. */
export function normalizeMimeType(mime: string | null | undefined): string {
  const base = (mime ?? "").split(";")[0]!.trim().toLowerCase();
  if (base === "image/jpg" || base === "image/pjpeg") return "image/jpeg";
  if (base === "video/avi" || base === "video/msvideo") return "video/x-msvideo";
  if (base === "audio/x-wav" || base === "audio/wave" || base === "audio/vnd.wave")
    return "audio/wav";
  if (base === "audio/x-m4a" || base === "audio/m4a") return "audio/mp4";
  if (base === "audio/mp3" || base === "audio/mpeg3") return "audio/mpeg";
  if (base === "audio/x-flac") return "audio/flac";
  if (base === "image/heif") return "image/heic";
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
const AUDIO_MP4_BRANDS = new Set(["M4A ", "M4B ", "M4P "]);
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);
const AVIF_BRANDS = new Set(["avif", "avis"]);

function detectIsoBmff(bytes: Uint8Array): string | null {
  // Box size (4 bytes) then "ftyp" then the major brand (4 bytes).
  if (bytes.length < 12 || ascii(bytes, 4, 8) !== "ftyp") return null;
  const brand = ascii(bytes, 8, 12);
  if (QUICKTIME_BRANDS.has(brand)) return "video/quicktime";
  if (AUDIO_MP4_BRANDS.has(brand)) return "audio/mp4";
  if (HEIC_BRANDS.has(brand)) return "image/heic";
  // AVIF also uses ftyp. It is not accepted anywhere yet.
  if (AVIF_BRANDS.has(brand)) return null;
  return "video/mp4";
}

/** WebM and Matroska share the EBML header; the DocType element names which. */
function detectEbml(bytes: Uint8Array): string | null {
  if (!startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return null;
  const header = ascii(bytes, 0, 64);
  return header.includes("matroska") ? "video/x-matroska" : "video/webm";
}

/** EPUB is a ZIP whose first entry is an uncompressed file named "mimetype". */
function detectZip(bytes: Uint8Array): string | null {
  const local = startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
  const empty = startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]);
  if (!local && !empty) return null;
  if (
    local &&
    ascii(bytes, 30, 38) === "mimetype" &&
    ascii(bytes, 38, 58) === "application/epub+zip"
  ) {
    return "application/epub+zip";
  }
  return "application/zip";
}

/** MP3 (ID3 tag or MPEG audio frame) and AAC in ADTS share the 0xFFF sync word. */
function detectMpegAudio(bytes: Uint8Array): string | null {
  if (ascii(bytes, 0, 3) === "ID3") return "audio/mpeg";
  if (bytes.length < 2 || bytes[0] !== 0xff) return null;
  const second = bytes[1]!;
  // ADTS: sync 1111 1111 1111, layer 00
  if ((second & 0xf6) === 0xf0) return "audio/aac";
  // MPEG audio frame: sync 1111 1111 111, layer not 00
  if ((second & 0xe0) === 0xe0 && (second & 0x06) !== 0) return "audio/mpeg";
  return null;
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
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE") return "audio/wav";
  if (ascii(bytes, 0, 4) === "fLaC") return "audio/flac";
  if (ascii(bytes, 0, 5) === "%PDF-") return "application/pdf";
  const ebml = detectEbml(bytes);
  if (ebml) return ebml;
  const zip = detectZip(bytes);
  if (zip) return zip;
  const iso = detectIsoBmff(bytes);
  if (iso) return iso;
  const mpeg = detectMpegAudio(bytes);
  if (mpeg) return mpeg;
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
