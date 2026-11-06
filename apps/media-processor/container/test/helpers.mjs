/**
 * Test helpers: a fake r2.internal, a small zip writer, and fixture builders.
 * Every fixture is generated at test time, so the repository holds no binary
 * files and no live malware sample (EICAR is a harmless industry test string).
 */
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

export const PUBLIC_ID = "abcdefghijklmnop";

/** Fake of the Worker's R2 outbound handler: a Map behind GET and PUT /object/{key}. */
export async function startFakeR2() {
  const objects = new Map();
  const requests = [];
  const server = createServer((req, res) => {
    const key = decodeURIComponent((req.url ?? "").replace(/^\/object\//, ""));
    requests.push({ method: req.method, key, grant: req.headers["x-amped-grant"] });
    if (req.method === "GET") {
      const object = objects.get(key);
      if (!object) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "content-type": object.contentType }).end(object.body);
      return;
    }
    if (req.method === "PUT") {
      const chunks = [];
      req.on("data", chunk => chunks.push(chunk));
      req.on("end", () => {
        objects.set(key, { body: Buffer.concat(chunks), contentType: req.headers["content-type"] });
        res.writeHead(200).end();
      });
      return;
    }
    res.writeHead(405).end();
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  process.env.R2_ENDPOINT = `http://127.0.0.1:${port}`;
  return {
    objects,
    requests,
    put: (key, body, contentType = "application/octet-stream") =>
      objects.set(key, { body: Buffer.from(body), contentType }),
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

export function job(overrides = {}) {
  return {
    publicId: PUBLIC_ID,
    grant: "test-grant",
    source: `incoming/${PUBLIC_ID}/original.bin`,
    derivedPrefix: `derived/${PUBLIC_ID}/`,
    audioPrefix: `audio/${PUBLIC_ID}/`,
    originalKey: `originals/${PUBLIC_ID}/original.bin`,
    previewSeconds: null,
    ...overrides,
  };
}

/** Minimal zip writer. method 0 stores, 8 deflates. */
export function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data, method = 8, encrypted = false } of entries) {
    const raw = Buffer.from(data);
    const body = method === 8 ? deflateRawSync(raw) : raw;
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(encrypted ? 1 : 0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(encrypted ? 1 : 0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/**
 * The EICAR anti malware test file. Harmless; every scanner detects it. Built from
 * two halves so this source file is not itself flagged by scanners on laptops or CI.
 */
export const EICAR = Buffer.from(
  ["X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR", "-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"].join(""),
  "latin1"
);

/** A ClamAV database that detects EICAR, since the official one cannot download here. */
export async function testClamDb() {
  const dir = await mkdtemp(join(tmpdir(), "clamdb-"));
  const md5 = createHash("md5").update(EICAR).digest("hex");
  await writeFile(join(dir, "test.hdb"), `${md5}:${EICAR.length}:Eicar-Test-Signature\n`);
  return dir;
}

/** 1200 x 800 PNG with orientation 6 (stored sideways), a GPS position and a copyright. */
export function gpsPng() {
  return sharp({ create: { width: 1200, height: 800, channels: 3, background: "#3366aa" } })
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Copyright: "Jane Doe" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "51/1 30/1 0/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "0/1 7/1 0/1",
      },
    })
    .png()
    .toBuffer();
}

/** A Windows executable header, uploaded under an image, audio or PDF name. */
export const RENAMED_EXE = Buffer.concat([
  Buffer.from("MZ", "latin1"),
  Buffer.alloc(58),
  Buffer.from([0x80, 0, 0, 0]),
  Buffer.alloc(64),
  Buffer.from("PE\0\0", "latin1"),
  Buffer.alloc(512, 0x90),
]);

/** 30 seconds of tone as MP3 with ID3 tags (title, artist, comment). */
export async function taggedMp3() {
  const dir = await mkdtemp(join(tmpdir(), "mp3-"));
  const path = join(dir, "tone.mp3");
  execFileSync("ffmpeg", [
    "-nostdin",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=30",
    "-metadata",
    "title=Secret Demo",
    "-metadata",
    "artist=Jane Doe",
    "-metadata",
    "comment=recorded at 12 Home Street",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    path,
  ]);
  return path;
}

/** A 30 MB file of zeros in a 30 KB zip: about 1000 times expansion. */
export function zipBomb() {
  return zip([{ name: "zeros.bin", data: Buffer.alloc(30 * 1024 * 1024) }]);
}

/** A valid PDF with pages, an Info dictionary and a catalog XMP stream. */
export function pdfWithMetadata(pageCount = 4) {
  const objects = [];
  const pageIds = Array.from({ length: pageCount }, (_, i) => 6 + i * 2);
  const xmp =
    '<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Jane Doe XMP</dc:creator></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
  objects[1] = "<< /Type /Catalog /Pages 2 0 R /Metadata 4 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`;
  objects[3] =
    "<< /Author (Jane Doe) /Creator (Secret Tool) /Producer (Home Laptop) /Title (Draft) >>";
  objects[4] = `<< /Type /Metadata /Subtype /XML /Length ${xmp.length} >>\nstream\n${xmp}\nendstream`;
  objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pageIds.forEach((id, index) => {
    const text = `BT /F1 36 Tf 72 700 Td (Page ${index + 1}) Tj ET`;
    objects[id] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents ${id + 1} 0 R >>`;
    objects[id + 1] = `<< /Length ${text.length} >>\nstream\n${text}\nendstream`;
  });
  let out = "%PDF-1.7\n";
  const offsets = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** A small EPUB 3 with a cover image declared by `properties="cover-image"`. */
export async function epubWithCover() {
  const cover = await sharp({
    create: { width: 600, height: 900, channels: 3, background: "#aa3366" },
  })
    .png()
    .toBuffer();
  return zip([
    { name: "mimetype", data: "application/epub+zip", method: 0 },
    {
      name: "META-INF/container.xml",
      data: '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    },
    {
      name: "OEBPS/content.opf",
      data: '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><manifest><item id="c" href="images/cover.png" media-type="image/png" properties="cover-image"/><item id="t" href="text.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="t"/></spine></package>',
    },
    { name: "OEBPS/text.xhtml", data: "<html><body><p>Chapter one</p></body></html>" },
    { name: "OEBPS/images/cover.png", data: cover, method: 0 },
  ]);
}
