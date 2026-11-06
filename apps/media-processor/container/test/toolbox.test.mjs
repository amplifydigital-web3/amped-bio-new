/**
 * Media toolbox tests (content system PR 4, spec 3.5). They run the real tools:
 * sharp, ffmpeg, ffprobe, ClamAV (clamscan with a test database), poppler, qpdf,
 * unzip. Run from apps/media-processor/container:
 *
 *   npm ci && npm test
 *
 * Needs ffmpeg, clamav, poppler-utils, qpdf, libheif-examples and unzip on the
 * machine (the Dockerfile installs the same set). CI runs them in the
 * media-toolbox job of typecheck-build.yml.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import sharp from "sharp";
import { handle } from "../src/server.mjs";
import {
  EICAR,
  PUBLIC_ID,
  RENAMED_EXE,
  epubWithCover,
  gpsPng,
  job,
  pdfWithMetadata,
  startFakeR2,
  taggedMp3,
  testClamDb,
  zip,
  zipBomb,
} from "./helpers.mjs";

let r2;
const source = ext => `incoming/${PUBLIC_ID}/original.${ext}`;

before(async () => {
  r2 = await startFakeR2();
  process.env.CLAMAV_MODE = "clamscan";
  process.env.CLAMAV_DB = await testClamDb();
});
after(() => r2.close());

function ffprobeTags(buffer, name) {
  return mkdtemp(join(tmpdir(), "probe-")).then(async dir => {
    const path = join(dir, name);
    await writeFile(path, buffer);
    return JSON.parse(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        path,
      ]).toString()
    );
  });
}

describe("scan", () => {
  it("passes a clean file", async () => {
    r2.put(source("pdf"), pdfWithMetadata(1));
    const { status, body } = await handle("/scan", job({ source: source("pdf"), ext: "pdf" }));
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true, verdict: "clean" });
  });

  it("finds EICAR, alone and inside a zip", async () => {
    r2.put(source("zip"), EICAR);
    let { body } = await handle("/scan", job({ source: source("zip"), ext: "bin" }));
    assert.deepEqual(body, {
      ok: true,
      verdict: "infected",
      signature: "Eicar-Test-Signature.UNOFFICIAL",
    });

    r2.put(
      source("zip"),
      zip([
        { name: "readme.txt", data: "hello" },
        { name: "tool.com", data: EICAR },
      ])
    );
    ({ body } = await handle("/scan", job({ source: source("zip"), ext: "zip" })));
    assert.equal(body.verdict, "infected");
  });

  it("fails a zip bomb on its expansion ratio before scanning", async () => {
    r2.put(source("zip"), zipBomb());
    const { body } = await handle("/scan", job({ source: source("zip"), ext: "zip" }));
    assert.deepEqual(body, { ok: false, reason: "archive_ratio" });
  });

  it("fails an encrypted archive it cannot look inside", async () => {
    r2.put(
      source("zip"),
      zip([{ name: "secret.txt", data: "x".repeat(64), method: 0, encrypted: true }])
    );
    const { body } = await handle("/scan", job({ source: source("zip"), ext: "zip" }));
    assert.deepEqual(body, { ok: false, reason: "archive_encrypted" });
  });

  it("fails a renamed executable that claims to be a zip", async () => {
    r2.put(source("zip"), RENAMED_EXE);
    const { body } = await handle("/scan", job({ source: source("zip"), ext: "zip" }));
    assert.deepEqual(body, { ok: false, reason: "archive_corrupt" });
  });

  it("reports a missing source without a retry", async () => {
    const { status, body } = await handle(
      "/scan",
      job({ source: `incoming/${PUBLIC_ID}/missing.zip`, ext: "zip" })
    );
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: false, reason: "source_missing" });
  });
});

describe("image", () => {
  it("removes EXIF and GPS, applies orientation and writes every rendition", async () => {
    const input = await gpsPng();
    const inputMeta = await sharp(input).metadata();
    assert.ok(inputMeta.exif, "fixture carries EXIF");
    assert.ok(input.includes(Buffer.from("Jane Doe")), "fixture carries the copyright text");

    r2.put(source("png"), input, "image/png");
    const { body } = await handle(
      "/image",
      job({ source: source("png"), ext: "png", mode: "item" })
    );
    assert.equal(body.ok, true);
    // Stored sideways with orientation 6: the result is 800 wide and 1200 tall
    assert.equal(body.width, 800);
    assert.equal(body.height, 1200);
    assert.deepEqual(
      body.assets.map(asset => asset.variant),
      ["320.webp", "320.jpg", "640.webp", "640.jpg", "full.webp", "full.jpg"]
    );
    assert.ok(body.assets.every(asset => asset.role === "RENDITION" && asset.storage === "R2"));
    assert.equal(body.blur.role, "BLUR");
    assert.equal(body.blur.width, 32);
    assert.deepEqual(body.frames, [`derived/${PUBLIC_ID}/rendition/640.jpg`]);

    for (const asset of [...body.assets, body.blur]) {
      const stored = r2.objects.get(asset.r2Key);
      assert.ok(stored, `${asset.r2Key} written`);
      assert.equal(stored.body.length, asset.size);
      const meta = await sharp(stored.body).metadata();
      assert.equal(meta.exif, undefined, `${asset.r2Key} has no EXIF`);
      assert.equal(meta.xmp, undefined, `${asset.r2Key} has no XMP`);
      assert.ok(
        !stored.body.includes(Buffer.from("Jane Doe")),
        `${asset.r2Key} has no copyright text`
      );
    }
    // Reads only the source; writes only under derived/{publicId}/
    const puts = r2.requests.filter(request => request.method === "PUT");
    assert.ok(puts.every(request => request.key.startsWith(`derived/${PUBLIC_ID}/`)));
    assert.ok(r2.requests.every(request => request.grant === "test-grant"));
  });

  it("caps the longest side at 4096", async () => {
    const big = await sharp({
      create: { width: 6000, height: 3000, channels: 3, background: "#000" },
    })
      .jpeg()
      .toBuffer();
    r2.put(source("jpg"), big);
    const { body } = await handle(
      "/image",
      job({ source: source("jpg"), ext: "jpg", mode: "item" })
    );
    assert.equal(body.width, 4096);
    assert.equal(body.height, 2048);
  });

  it("writes COVER renditions for a video poster", async () => {
    const poster = await sharp({
      create: { width: 1280, height: 720, channels: 3, background: "#123" },
    })
      .jpeg()
      .toBuffer();
    r2.put(`incoming/${PUBLIC_ID}/poster.jpg`, poster);
    const { body } = await handle(
      "/image",
      job({ source: `incoming/${PUBLIC_ID}/poster.jpg`, ext: "jpg", mode: "poster" })
    );
    assert.ok(body.assets.every(asset => asset.role === "COVER"));
    assert.ok(body.assets[0].r2Key.startsWith(`derived/${PUBLIC_ID}/cover/`));
  });

  it("refuses a renamed executable", async () => {
    r2.put(source("jpg"), RENAMED_EXE);
    const { body } = await handle(
      "/image",
      job({ source: source("jpg"), ext: "jpg", mode: "item" })
    );
    assert.deepEqual(body, { ok: false, reason: "image_unreadable" });
  });
});

describe("audio", () => {
  it("re-encodes a 30 second MP3 to AAC without tags, with a preview and a waveform", async () => {
    const mp3 = await readFile(await taggedMp3());
    const input = await ffprobeTags(mp3, "in.mp3");
    assert.equal(input.format.tags.title, "Secret Demo", "fixture carries tags");

    r2.put(source("mp3"), mp3, "audio/mpeg");
    const { body } = await handle(
      "/audio",
      job({ source: source("mp3"), ext: "mp3", previewSeconds: 10 })
    );
    assert.equal(body.ok, true);
    assert.ok(Math.abs(body.durationMs - 30_000) < 200, `duration ${body.durationMs}`);
    assert.deepEqual(
      body.assets.map(asset => [asset.role, asset.r2Key]),
      [
        ["RENDITION", `audio/${PUBLIC_ID}/full.m4a`],
        ["AUDIO_PREVIEW", `audio/${PUBLIC_ID}/preview.m4a`],
        ["WAVEFORM", `derived/${PUBLIC_ID}/waveform/peaks.json`],
      ]
    );

    const full = await ffprobeTags(r2.objects.get(`audio/${PUBLIC_ID}/full.m4a`).body, "full.m4a");
    assert.equal(full.streams.length, 1);
    assert.equal(full.streams[0].codec_name, "aac");
    const tags = { ...full.format.tags, ...full.streams[0].tags };
    for (const name of ["title", "artist", "comment"]) {
      assert.equal(tags[name], undefined, `no ${name} tag`);
    }
    const bitrate = Number(full.streams[0].bit_rate);
    assert.ok(bitrate > 120_000 && bitrate < 200_000, `bitrate ${bitrate}`);

    const preview = await ffprobeTags(
      r2.objects.get(`audio/${PUBLIC_ID}/preview.m4a`).body,
      "p.m4a"
    );
    assert.ok(Math.abs(Number(preview.format.duration) - 10) < 0.2);

    const waveform = JSON.parse(r2.objects.get(`derived/${PUBLIC_ID}/waveform/peaks.json`).body);
    assert.equal(waveform.peaks.length, 1000);
    assert.ok(waveform.peaks.every(peak => peak >= 0 && peak <= 1));
    assert.ok(Math.max(...waveform.peaks) > 0.05, "tone is audible in the peaks");
  });

  it("skips the preview when the item has none", async () => {
    const mp3 = await readFile(await taggedMp3());
    r2.put(source("mp3"), mp3);
    const { body } = await handle("/audio", job({ source: source("mp3"), ext: "mp3" }));
    assert.deepEqual(
      body.assets.map(asset => asset.role),
      ["RENDITION", "WAVEFORM"]
    );
  });

  it("refuses a renamed executable", async () => {
    r2.put(source("mp3"), RENAMED_EXE);
    const { body } = await handle("/audio", job({ source: source("mp3"), ext: "mp3" }));
    assert.deepEqual(body, { ok: false, reason: "audio_unreadable" });
  });
});

describe("document", () => {
  it("removes PDF metadata, keeps the cleaned file and renders 3 page previews", async () => {
    const pdf = pdfWithMetadata(4);
    assert.ok(pdf.includes(Buffer.from("Jane Doe")));
    r2.put(source("pdf"), pdf, "application/pdf");
    const originalKey = `originals/${PUBLIC_ID}/original.pdf`;
    const { body } = await handle(
      "/document",
      job({ source: source("pdf"), ext: "pdf", originalKey })
    );
    assert.equal(body.ok, true);
    assert.equal(body.pageCount, 4);
    assert.equal(body.original.r2Key, originalKey);

    const cleaned = r2.objects.get(originalKey).body;
    for (const secret of ["Jane Doe", "Secret Tool", "Home Laptop", "xmpmeta"]) {
      assert.ok(!cleaned.includes(Buffer.from(secret)), `cleaned PDF has no ${secret}`);
    }
    const dir = await mkdtemp(join(tmpdir(), "pdf-"));
    await writeFile(join(dir, "clean.pdf"), cleaned);
    const info = execFileSync("pdfinfo", [join(dir, "clean.pdf")]).toString();
    assert.match(info, /Pages:\s+4/);

    const pages = body.assets.filter(asset => asset.role === "PAGE_PREVIEW");
    assert.deepEqual(
      pages.map(asset => asset.variant),
      ["p1", "p2", "p3"]
    );
    assert.equal(pages[0].width, 990, "letter page at 1280 px tall becomes 990 wide");
    assert.ok(body.assets.some(asset => asset.role === "COVER"));
    assert.equal(body.blur.role, "BLUR");
  });

  it("refuses a renamed executable as a PDF", async () => {
    r2.put(source("pdf"), RENAMED_EXE);
    const { body } = await handle("/document", job({ source: source("pdf"), ext: "pdf" }));
    assert.deepEqual(body, { ok: false, reason: "pdf_unreadable" });
  });

  it("keeps an EPUB as uploaded and renders its cover", async () => {
    const epub = await epubWithCover();
    r2.put(source("epub"), epub, "application/epub+zip");
    const originalKey = `originals/${PUBLIC_ID}/original.epub`;
    const { body } = await handle(
      "/document",
      job({ source: source("epub"), ext: "epub", originalKey })
    );
    assert.equal(body.ok, true);
    assert.ok(r2.objects.get(originalKey).body.equals(epub));
    const covers = body.assets.filter(asset => asset.role === "COVER");
    assert.ok(covers.length > 0);
    assert.equal(covers.find(asset => asset.variant === "full.jpg").height, 900);
    assert.equal(body.blur.role, "BLUR");
  });
});

describe("requests", () => {
  it("refuses a job that reads outside its own incoming folder", async () => {
    const { status } = await handle(
      "/scan",
      job({ source: "incoming/zzzzzzzzzzzzzzzz/original.zip", ext: "zip" })
    );
    assert.equal(status, 400);
  });

  it("answers 404 for an unknown path", async () => {
    assert.equal((await handle("/exec", job())).status, 404);
  });
});
