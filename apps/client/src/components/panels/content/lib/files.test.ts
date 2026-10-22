import { describe, expect, it } from "vitest";
import {
  bytesLeft,
  formatBytes,
  formatDuration,
  kindForFile,
  mimeForFile,
  parseTimecode,
  preflightFile,
  titleFromFileName,
  type StorageSnapshot,
} from "./files";

const MB = 1024 * 1024;
const GB = 1024 * MB;

const storage: StorageSnapshot = {
  bytesLimit: 5 * GB,
  bytesUsed: 2 * GB,
  bytesReserved: 0,
  videoMinutesLimit: 300,
  videoMinutesUsed: 84,
  limits: { video: 2 * GB, audio: 500 * MB, image: 25 * MB, document: 100 * MB, file: 500 * MB },
};

const none = { bytes: 0, minutes: 0 };

describe("kindForFile and mimeForFile", () => {
  it("maps extensions to kinds, case insensitive", () => {
    expect(kindForFile("Harbor.MOV")).toBe("video");
    expect(kindForFile("room tone.wav")).toBe("audio");
    expect(kindForFile("cover.heic")).toBe("image");
    expect(kindForFile("notes.epub")).toBe("document");
    expect(kindForFile("presets.zip")).toBe("file");
  });

  it("refuses types the spec does not accept", () => {
    for (const name of ["page.svg", "setup.exe", "deck.pptx", "pack.rar", "clip.avi", "noext"]) {
      expect(kindForFile(name)).toBeNull();
    }
  });

  it("keeps an allowed browser type and fills a missing one from the extension", () => {
    expect(mimeForFile({ name: "a.mp3", type: "audio/mpeg" }, "audio")).toBe("audio/mpeg");
    expect(mimeForFile({ name: "a.mkv", type: "" }, "video")).toBe("video/x-matroska");
    expect(mimeForFile({ name: "a.wav", type: "audio/vnd.wave" }, "audio")).toBe("audio/wav");
    expect(mimeForFile({ name: "a.epub", type: "" }, "document")).toBe("application/epub+zip");
  });

  it("defaults the title to the file name without its extension", () => {
    expect(titleFromFileName("Shoreline, 6 a.m.jpg")).toBe("Shoreline, 6 a.m");
    expect(titleFromFileName(".jpg")).toBe(".jpg");
  });
});

describe("formatting", () => {
  it("uses the server's binary units", () => {
    expect(formatBytes(5120 * MB)).toBe("5 GB");
    expect(formatBytes(2 * GB)).toBe("2 GB");
    expect(formatBytes(500 * MB)).toBe("500 MB");
    expect(formatBytes(4.2 * MB)).toBe("4.2 MB");
    expect(formatBytes(1.4 * GB)).toBe("1.4 GB");
    expect(formatBytes(0)).toBe("0 MB");
  });

  it("formats durations as the tiles show them", () => {
    expect(formatDuration(760_000)).toBe("12:40");
    expect(formatDuration(3_725_000)).toBe("1:02:05");
    expect(formatDuration(null)).toBeNull();
  });

  it("parses chapter starts", () => {
    expect(parseTimecode("0:00")).toBe(0);
    expect(parseTimecode("6:12")).toBe(372_000);
    expect(parseTimecode("1:02:05")).toBe(3_725_000);
    expect(parseTimecode("6:75")).toBeNull();
    expect(parseTimecode("six")).toBeNull();
    expect(parseTimecode("")).toBeNull();
  });
});

describe("preflightFile", () => {
  const file = (name: string, size: number, type = "") => ({ name, size, type });

  it("accepts a file inside the limits", () => {
    expect(preflightFile(file("a.mp3", 10 * MB, "audio/mpeg"), storage, none)).toEqual({
      ok: true,
      kind: "audio",
      mimeType: "audio/mpeg",
    });
  });

  it("refuses an unsupported type with the fix", () => {
    const result = preflightFile(file("a.exe", MB), storage, none);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/not supported/);
  });

  it("refuses a file over its kind's limit", () => {
    const result = preflightFile(file("a.jpg", 26 * MB, "image/jpeg"), storage, none);
    expect(!result.ok && result.reason).toBe("This file is larger than the 25 MB limit.");
  });

  it("refuses an empty file", () => {
    expect(preflightFile(file("a.pdf", 0, "application/pdf"), storage, none).ok).toBe(false);
  });

  it("counts bytes reserved on the server and files earlier in the batch", () => {
    const tight = { ...storage, bytesUsed: 5 * GB - 300 * MB, bytesReserved: 100 * MB };
    expect(bytesLeft(tight)).toBe(200 * MB);
    expect(preflightFile(file("a.zip", 150 * MB), tight, none).ok).toBe(true);
    const second = preflightFile(file("b.zip", 150 * MB), tight, { bytes: 150 * MB, minutes: 0 });
    expect(!second.ok && second.reason).toMatch(/Not enough storage/);
  });

  it("checks video against storage, as the server reserves its bytes, and minutes", () => {
    const full = { ...storage, bytesUsed: 5 * GB - 500 * MB };
    const big = preflightFile(file("a.mp4", GB, "video/mp4"), full, none);
    expect(!big.ok && big.reason).toMatch(/Not enough storage/);
    const noMinutes = { ...storage, videoMinutesUsed: 300 };
    expect(preflightFile(file("a.mp4", GB, "video/mp4"), noMinutes, none).ok).toBe(false);
    const tooLong = preflightFile(file("a.mp4", GB, "video/mp4"), storage, none, 217 * 60);
    expect(!tooLong.ok && tooLong.reason).toMatch(/longer than your video minutes/);
    expect(preflightFile(file("a.mp4", GB, "video/mp4"), storage, none, 216 * 60).ok).toBe(true);
  });
});
