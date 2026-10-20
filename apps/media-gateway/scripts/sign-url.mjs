#!/usr/bin/env node
/**
 * QA only: prints a gateway URL for one R2 key, signed the way the API signs
 * (apps/server services/cloudflare/mediaToken.ts). Use it to test a deployed
 * gateway before PR 6 adds content.getReadUrl. Handoff: docs/fixes/content-media-gateway.md.
 *
 *   pnpm run build:packages
 *   MEDIA_TOKEN_KEYS='s1:...' node apps/media-gateway/scripts/sign-url.mjs <r2Key> [--download] [--ttl 600] [--origin https://media.ampedusercontent-staging.com]
 *
 * The key value is read from the environment and never printed.
 */
import { createHmac, randomBytes } from "node:crypto";
import * as C from "../../../packages/constants/dist/index.mjs";

const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const key = args.find(
  arg => !arg.startsWith("--") && !args[args.indexOf(arg) - 1]?.startsWith("--")
);
if (!key || !process.env.MEDIA_TOKEN_KEYS) {
  console.error(
    "Usage: MEDIA_TOKEN_KEYS=... node sign-url.mjs <r2Key> [--download] [--ttl seconds] [--origin url]"
  );
  process.exit(1);
}

const [signer] = C.parseMediaTokenKeys(process.env.MEDIA_TOKEN_KEYS);
const download = args.includes("--download");
const ttl = Number(option("--ttl") ?? 600);
const origin = (option("--origin") ?? "https://media.ampedusercontent-staging.com").replace(
  /\/+$/,
  ""
);
const payload = {
  k: key,
  r: "qa",
  exp: Math.floor(Date.now() / 1000) + ttl,
  dl: download ? 1 : 0,
  ...(download
    ? { fn: key.slice(key.lastIndexOf("/") + 1), j: C.base64UrlEncodeBytes(randomBytes(16)) }
    : {}),
};
const input = C.mediaTokenSigningInput(signer.kid, C.encodeMediaTokenPayload(payload));
const signature = C.base64UrlEncodeBytes(
  createHmac("sha256", signer.secret).update(input).digest()
);
const path = key.split("/").map(encodeURIComponent).join("/");
console.log(`${origin}/${path}?t=${encodeURIComponent(`${input}.${signature}`)}`);
