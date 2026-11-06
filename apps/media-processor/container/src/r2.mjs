/**
 * R2 access from inside the container. The container has no internet and no R2
 * credentials. It calls http://r2.internal/object/{key}; the Worker's outbound
 * handler answers, checks the job grant in `x-amped-grant`, and only allows:
 *   GET  incoming/{publicId}/...
 *   PUT  originals/, audio/ and derived/{publicId}/...
 * So a file that exploits a decoder can at most touch its own item's keys.
 */
import { createWriteStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const endpoint = () => process.env.R2_ENDPOINT || "http://r2.internal";

/** Thrown for a missing source object. The pipeline reports it as a failed step. */
export class SourceMissingError extends Error {
  constructor(key) {
    super(`source missing: ${key}`);
    this.name = "SourceMissingError";
  }
}

function url(key) {
  if (!/^[a-z]+\/[a-z0-9]{16}\/[A-Za-z0-9._/-]+$/.test(key) || key.includes("..")) {
    throw new Error(`refusing key ${key}`);
  }
  return `${endpoint()}/object/${key}`;
}

/** Streams an object to a local file. Returns its size in bytes. */
export async function download(job, key, path) {
  const response = await fetch(url(key), { headers: { "x-amped-grant": job.grant } });
  if (response.status === 404) throw new SourceMissingError(key);
  if (!response.ok || !response.body) throw new Error(`r2 get ${key}: ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(path));
  return (await stat(path)).size;
}

/** Uploads a local file. Returns its size in bytes. */
export async function upload(job, key, path, contentType) {
  const body = await readFile(path);
  const response = await fetch(url(key), {
    method: "PUT",
    headers: {
      "x-amped-grant": job.grant,
      "content-type": contentType,
      "content-length": String(body.byteLength),
    },
    body,
  });
  if (!response.ok) throw new Error(`r2 put ${key}: ${response.status}`);
  return body.byteLength;
}
