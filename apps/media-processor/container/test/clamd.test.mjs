/**
 * The same EICAR check through clamd and `clamdscan --fdpass`, the way the image
 * scans. Skipped unless CLAMD_CONFIG points at a running clamd configuration whose
 * database detects EICAR (docs/fixes/content-media-processor.md, section 3.5).
 */
import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import { handle } from "../src/server.mjs";
import { EICAR, PUBLIC_ID, job, startFakeR2 } from "./helpers.mjs";

const enabled = Boolean(process.env.CLAMD_CONFIG && process.env.CLAMD_SOCKET);
let r2;

before(async () => {
  if (enabled) r2 = await startFakeR2();
});
after(() => r2?.close());

it("detects EICAR through clamd", { skip: !enabled && "CLAMD_CONFIG not set" }, async () => {
  const previous = process.env.CLAMAV_MODE;
  process.env.CLAMAV_MODE = "clamd";
  try {
    const key = `incoming/${PUBLIC_ID}/original.bin`;
    r2.put(key, EICAR);
    const { body } = await handle("/scan", job({ source: key, ext: "bin" }));
    assert.equal(body.verdict, "infected");
    assert.match(body.signature, /Eicar/);
    r2.put(key, "hello");
    assert.deepEqual((await handle("/scan", job({ source: key, ext: "bin" }))).body, {
      ok: true,
      verdict: "clean",
    });
  } finally {
    process.env.CLAMAV_MODE = previous;
  }
});
