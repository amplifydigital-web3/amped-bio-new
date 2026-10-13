/**
 * Content system PR 2 (Build Board #20): the real type check at completeUpload
 * (spec 3.11, the second of three type checks) for every kind that goes to R2.
 * Video goes to Stream, which reads the container itself.
 * Handoff: docs/fixes/content-foundation.md.
 */
import { describe, it, expect } from "vitest";
import { CONTENT_ALLOWED_TYPES } from "@repo/constants";
import { checkFileSignature, detectFileType } from "../utils/fileSignature";

const text = (value: string) => new TextEncoder().encode(value);
const pad = (head: Uint8Array) => {
  const out = new Uint8Array(Math.max(64, head.length));
  out.set(head);
  return out;
};
const bytes = (...values: number[]) => pad(Uint8Array.from(values));
const zipEntry = (name: string, content: string) => {
  const header = new Uint8Array(30);
  header.set([0x50, 0x4b, 0x03, 0x04]);
  return pad(Uint8Array.from([...header, ...text(name), ...text(content)]));
};

/** Four byte little endian or big endian sizes do not matter to detection; zeros are fine. */
const sized = (head: string, rest: string) =>
  pad(Uint8Array.from([...text(head), 0, 0, 0, 0, ...text(rest)]));
const box = (brand: string) =>
  pad(Uint8Array.from([0, 0, 0, 32, ...text("ftyp"), ...text(brand), 0, 0, 0, 0]));

const SAMPLES: Array<[string, Uint8Array, string]> = [
  ["mp3 with ID3", pad(Uint8Array.from([...text("ID3"), 4, 0, 0])), "audio/mpeg"],
  ["mp3 frame", bytes(0xff, 0xfb, 0x90, 0x64), "audio/mpeg"],
  ["aac in ADTS", bytes(0xff, 0xf1, 0x50, 0x80), "audio/aac"],
  ["wav", sized("RIFF", "WAVEfmt "), "audio/wav"],
  ["flac", pad(Uint8Array.from([...text("fLaC"), 0, 0, 0, 34])), "audio/flac"],
  ["m4a", box("M4A "), "audio/mp4"],
  ["pdf", pad(text("%PDF-1.7")), "application/pdf"],
  ["epub", zipEntry("mimetype", "application/epub+zip"), "application/epub+zip"],
  ["zip", zipEntry("presets/a.wav", ""), "application/zip"],
  ["webp", sized("RIFF", "WEBPVP8 "), "image/webp"],
  ["gif", pad(text("GIF89a")), "image/gif"],
  ["heic", box("heic"), "image/heic"],
  [
    "mkv",
    pad(Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0xa3, 0x42, 0x82, 0x88, ...text("matroska")])),
    "video/x-matroska",
  ],
];

describe("content type detection", () => {
  it.each(SAMPLES)("detects %s", (_label, sample, expected) => {
    expect(detectFileType(sample)).toBe(expected);
  });

  it("accepts each kind's own types, including MIME aliases browsers send", () => {
    const audio = CONTENT_ALLOWED_TYPES.audio.mimes;
    expect(checkFileSignature(sized("RIFF", "WAVE"), "audio/x-wav", audio).ok).toBe(true);
    expect(checkFileSignature(box("M4A "), "audio/x-m4a", audio).ok).toBe(true);
    expect(
      checkFileSignature(
        pad(text("%PDF-1.4")),
        "application/pdf",
        CONTENT_ALLOWED_TYPES.document.mimes
      ).ok
    ).toBe(true);
    expect(
      checkFileSignature(zipEntry("a.txt", ""), "application/zip", CONTENT_ALLOWED_TYPES.file.mimes)
        .ok
    ).toBe(true);
  });

  it("refuses a file whose bytes belong to another kind", () => {
    // A PDF renamed .mp3, an EPUB uploaded as a plain ZIP, an MP3 uploaded as an image
    expect(
      checkFileSignature(pad(text("%PDF-1.7")), "audio/mpeg", CONTENT_ALLOWED_TYPES.audio.mimes)
    ).toMatchObject({
      ok: false,
      reason: "not_allowed",
    });
    expect(
      checkFileSignature(
        zipEntry("mimetype", "application/epub+zip"),
        "application/zip",
        CONTENT_ALLOWED_TYPES.file.mimes
      )
    ).toMatchObject({ ok: false, reason: "not_allowed" });
    expect(
      checkFileSignature(pad(text("ID3")), "image/png", CONTENT_ALLOWED_TYPES.image.mimes)
    ).toMatchObject({
      ok: false,
      reason: "not_allowed",
    });
  });

  it("refuses a WAV declared as MP3 within the same kind", () => {
    expect(
      checkFileSignature(sized("RIFF", "WAVE"), "audio/mpeg", CONTENT_ALLOWED_TYPES.audio.mimes)
    ).toMatchObject({ ok: false, reason: "mismatch" });
  });

  it("refuses an executable, HTML and a script for every kind", () => {
    const evil = [
      bytes(0x4d, 0x5a, 0x90, 0x00),
      pad(text("<html><script>")),
      pad(text("#!/bin/sh\nrm -rf /")),
    ];
    for (const kind of Object.values(CONTENT_ALLOWED_TYPES)) {
      for (const sample of evil) {
        expect(checkFileSignature(sample, kind.mimes[0]!, kind.mimes).ok).toBe(false);
      }
    }
  });
});
