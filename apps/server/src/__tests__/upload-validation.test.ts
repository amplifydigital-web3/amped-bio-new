/**
 * PR fix/uploads-sdk-v3-validation (Build Board fix cards "Remove AWS SDK v2"
 * and "Enforce upload size and file type"). See
 * docs/fixes/uploads-sdk-v3-validation.md.
 *
 * Covers:
 * - real type detection from the first bytes of a file
 * - presigned PUT URLs signed on SDK v3 with Content-Type and Content-Length
 * - the CRC32 checksum trap in SDK v3 presigned PUTs
 * - the confirm step: missing object, size mismatch, type mismatch, success
 */
import { describe, it, expect } from "vitest";
import { S3Client, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import {
  checkFileSignature,
  detectFileType,
  normalizeMimeType,
  FILE_SIGNATURE_BYTES,
} from "../utils/fileSignature";
import { createPresignedPutUrl, verifyUploadedObject, type S3Sender } from "../services/s3Upload";

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);
const padTo = (head: Uint8Array, length = 64) => {
  const out = new Uint8Array(Math.max(length, head.length));
  out.set(head);
  return out;
};

const JPEG = padTo(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46));
const PNG = padTo(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d));
const WEBM = padTo(bytes(0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81));
const MP4 = padTo(text("\u0000\u0000\u0000\u0018ftypisom\u0000\u0000\u0002\u0000isomiso2"));
const MOV = padTo(text("\u0000\u0000\u0000\u0014ftypqt  \u0000\u0000\u0002\u0000qt  "));
const AVI = padTo(text("RIFF\u0010\u0000\u0000\u0000AVI LIST"));
const HEIC = padTo(text("\u0000\u0000\u0000\u0018ftypheic\u0000\u0000\u0000\u0000mif1heic"));
const SVG = text(
  '<?xml version="1.0"?>\n<!-- logo -->\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'
);
const BOM = String.fromCharCode(0xfeff);
const SVG_BOM = text(`${BOM}  <svg viewBox="0 0 1 1"/>`);
const HTML = text("<!doctype html><html><body><script>alert(1)</script></body></html>");
const EXE = padTo(bytes(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00));
const ZIP = padTo(bytes(0x50, 0x4b, 0x03, 0x04));

const AVATAR_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/svg+xml"];
const POOL_TYPES = ["image/jpeg", "image/jpg", "image/png"];
const BACKGROUND_TYPES = [
  ...AVATAR_TYPES,
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/webm",
];

describe("detectFileType", () => {
  it.each([
    ["jpeg", JPEG, "image/jpeg"],
    ["png", PNG, "image/png"],
    ["webm", WEBM, "video/webm"],
    ["mp4", MP4, "video/mp4"],
    ["quicktime", MOV, "video/quicktime"],
    ["avi", AVI, "video/x-msvideo"],
    ["svg with prolog and comment", SVG, "image/svg+xml"],
    ["svg with BOM and leading space", SVG_BOM, "image/svg+xml"],
  ])("detects %s", (_label, input, expected) => {
    expect(detectFileType(input)).toBe(expected);
  });

  it.each([
    ["html", HTML],
    ["windows executable", EXE],
    ["zip", ZIP],
    ["heic (not accepted yet)", HEIC],
    ["empty", new Uint8Array()],
  ])("returns null for %s", (_label, input) => {
    expect(detectFileType(input)).toBeNull();
  });

  it("does not take binary data with NUL bytes for SVG", () => {
    const fake = new Uint8Array([...text("<svg>"), 0x00, 0x01]);
    expect(detectFileType(fake)).toBeNull();
  });
});

describe("checkFileSignature", () => {
  it("accepts a JPEG declared as image/jpg (alias)", () => {
    expect(normalizeMimeType("image/jpg")).toBe("image/jpeg");
    expect(checkFileSignature(JPEG, "image/jpg", AVATAR_TYPES)).toEqual({
      ok: true,
      detectedType: "image/jpeg",
    });
  });

  it("rejects a PNG declared as JPEG", () => {
    expect(checkFileSignature(PNG, "image/jpeg", AVATAR_TYPES)).toMatchObject({
      ok: false,
      reason: "mismatch",
    });
  });

  it("rejects an SVG where only JPG and PNG are allowed", () => {
    expect(checkFileSignature(SVG, "image/png", POOL_TYPES)).toMatchObject({
      ok: false,
      reason: "not_allowed",
      detectedType: "image/svg+xml",
    });
  });

  it("rejects HTML renamed to .png", () => {
    expect(checkFileSignature(HTML, "image/png", AVATAR_TYPES)).toMatchObject({
      ok: false,
      reason: "unknown_type",
    });
  });

  it("rejects a video uploaded as an avatar", () => {
    expect(checkFileSignature(MP4, "image/png", AVATAR_TYPES)).toMatchObject({
      ok: false,
      reason: "not_allowed",
    });
  });

  it("treats MP4 and QuickTime as one family", () => {
    expect(checkFileSignature(MOV, "video/mp4", BACKGROUND_TYPES).ok).toBe(true);
    expect(checkFileSignature(MP4, "video/quicktime", BACKGROUND_TYPES).ok).toBe(true);
  });
});

describe("createPresignedPutUrl (AWS SDK v3)", () => {
  const credentials = { accessKeyId: "AKIATESTTESTTESTTEST", secretAccessKey: "x".repeat(40) };
  const client = new S3Client({
    region: "us-east-1",
    credentials,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const params = {
    bucket: "amped-test",
    key: "profiles/1-abc-7.png",
    contentType: "image/png",
    contentLength: 12345,
    expiresIn: 300,
  };

  it("signs Content-Type and Content-Length into the URL", async () => {
    const url = new URL(await createPresignedPutUrl(client, params));
    const signed = url.searchParams.get("X-Amz-SignedHeaders")?.split(";");
    expect(signed).toEqual(expect.arrayContaining(["content-length", "content-type", "host"]));
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.pathname).toContain("profiles/1-abc-7.png");
  });

  it("does not put an empty body checksum in the URL", async () => {
    const url = new URL(await createPresignedPutUrl(client, params));
    const keys = [...url.searchParams.keys()].map(key => key.toLowerCase());
    expect(keys.some(key => key.startsWith("x-amz-checksum"))).toBe(false);
    expect(keys).not.toContain("x-amz-sdk-checksum-algorithm");
  });

  it("documents the trap: a default v3 client adds a checksum that breaks browser PUTs", async () => {
    const defaultClient = new S3Client({ region: "us-east-1", credentials });
    const url = new URL(await createPresignedPutUrl(defaultClient, params));
    const keys = [...url.searchParams.keys()].map(key => key.toLowerCase());
    expect(keys.some(key => key.startsWith("x-amz-checksum"))).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN])("refuses an invalid size (%s)", async contentLength => {
    await expect(createPresignedPutUrl(client, { ...params, contentLength })).rejects.toThrow(
      /Invalid upload size/
    );
  });
});

/** A fake S3 that holds one object, or none. */
function fakeS3(object?: { size: number; head: Uint8Array }) {
  const calls: Array<{ name: string; input: any }> = [];
  const sender: S3Sender = {
    async send(command) {
      calls.push({ name: command.constructor.name, input: command.input });
      if (!object) {
        const error: any = new Error("NotFound");
        error.name = "NotFound";
        error.$metadata = { httpStatusCode: 404 };
        throw error;
      }
      if (command instanceof HeadObjectCommand) return { ContentLength: object.size };
      if (command instanceof GetObjectCommand) {
        return { Body: { transformToByteArray: async () => object.head } };
      }
      throw new Error("unexpected command");
    },
  };
  return { sender, calls };
}

describe("verifyUploadedObject", () => {
  const base = {
    bucket: "amped-test",
    key: "profiles/1-abc-7.png",
    declaredType: "image/png",
    allowedTypes: AVATAR_TYPES,
  };

  it("passes when size and type match", async () => {
    const { sender, calls } = fakeS3({ size: 2048, head: PNG });
    const result = await verifyUploadedObject(sender, { ...base, expectedSize: BigInt(2048) });
    expect(result).toEqual({ ok: true, size: 2048, detectedType: "image/png" });
    expect(calls.map(call => call.name)).toEqual(["HeadObjectCommand", "GetObjectCommand"]);
    expect(calls[1]!.input.Range).toBe(`bytes=0-${FILE_SIGNATURE_BYTES - 1}`);
  });

  it("reports a missing object", async () => {
    const { sender } = fakeS3();
    const result = await verifyUploadedObject(sender, { ...base, expectedSize: 2048 });
    expect(result).toMatchObject({ ok: false, reason: "missing" });
  });

  it("rejects a stored size that differs from the declared size, without reading the body", async () => {
    const { sender, calls } = fakeS3({ size: 500 * 1024 * 1024, head: PNG });
    const result = await verifyUploadedObject(sender, { ...base, expectedSize: 2048 });
    expect(result).toMatchObject({ ok: false, reason: "size_mismatch" });
    expect(calls.map(call => call.name)).toEqual(["HeadObjectCommand"]);
  });

  it("rejects a record with no declared size", async () => {
    const { sender } = fakeS3({ size: 2048, head: PNG });
    const result = await verifyUploadedObject(sender, { ...base, expectedSize: null });
    expect(result).toMatchObject({ ok: false, reason: "size_mismatch" });
  });

  it("rejects content that is not the declared type", async () => {
    const { sender } = fakeS3({ size: 2048, head: HTML });
    const result = await verifyUploadedObject(sender, { ...base, expectedSize: 2048 });
    expect(result).toMatchObject({ ok: false, reason: "type_mismatch" });
  });
});
