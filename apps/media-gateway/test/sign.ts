/**
 * Test signer. Mirrors the API's signMediaToken with WebCrypto so tests can mint
 * tokens inside workerd. token.test.ts checks it against the shared vectors.
 */
import {
  base64UrlEncodeBytes,
  encodeMediaTokenPayload,
  mediaTokenSigningInput,
  parseMediaTokenKeys,
  utf8Encode,
  type MediaTokenPayload,
} from "@repo/constants/src/mediaToken";
import { env } from "cloudflare:workers";

export async function signForTest(
  payload: MediaTokenPayload,
  kid?: string,
  keysValue: string = env.MEDIA_TOKEN_KEYS
): Promise<string> {
  const keys = parseMediaTokenKeys(keysValue);
  const signer = kid ? keys.find(key => key.kid === kid) : keys[0];
  if (!signer) throw new Error(`no test key ${kid}`);
  const key = await crypto.subtle.importKey(
    "raw",
    signer.secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const input = mediaTokenSigningInput(signer.kid, encodeMediaTokenPayload(payload));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, utf8Encode(input)));
  return `${input}.${base64UrlEncodeBytes(signature)}`;
}

export const nowSeconds = () => Math.floor(Date.now() / 1000);
