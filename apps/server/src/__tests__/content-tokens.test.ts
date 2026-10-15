/**
 * Content system PR 2 (Build Board #20): shared constants, media gateway tokens,
 * processor callback and Stream webhook signatures, Stream playback tokens and the
 * R2 upload URLs. No network: every Cloudflare call here is either offline
 * (presigning, signing) or a mocked fetch.
 * Handoff: docs/fixes/content-foundation.md.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createHmac, generateKeyPairSync, randomBytes, createVerify } from "node:crypto";
import { S3Client } from "@aws-sdk/client-s3";
import {
  CONTENT_UPLOAD,
  base64UrlDecodeBytes,
  base64UrlEncodeBytes,
  contentIncomingKey,
  contentPartCount,
  contentTypeAllowed,
  contentUsesMultipart,
  decodeMediaTokenPayload,
  encodeMediaTokenPayload,
  parseMediaTokenKeys,
  utf8Decode,
  utf8Encode,
} from "@repo/constants";
import { env } from "../env";
import {
  mediaUrl,
  signMediaToken,
  signProcessorCallback,
  verifyMediaToken,
  verifyProcessorCallback,
} from "../services/cloudflare/mediaToken";
import {
  createStreamDirectUpload,
  signStreamToken,
  streamSigningPem,
  streamUidFrom,
  streamUploadMetadata,
  verifyStreamWebhookSignature,
} from "../services/cloudflare/stream";
import { presignR2Parts, r2PartLength, setR2ClientForTests } from "../services/cloudflare/r2";
import { newContentPublicId } from "../services/content/ids";

const MB = 1024 * 1024;
const key = (kid: string) => `${kid}:${base64UrlEncodeBytes(randomBytes(48))}`;

describe("content constants", () => {
  it("accepts a type only when MIME and extension both belong to the kind", () => {
    expect(contentTypeAllowed("audio", "audio/mpeg", "Low Tide.mp3")).toBe(true);
    expect(contentTypeAllowed("audio", "audio/mpeg", "Low Tide.exe")).toBe(false);
    expect(contentTypeAllowed("audio", "application/pdf", "notes.mp3")).toBe(false);
    expect(contentTypeAllowed("image", "image/svg+xml", "logo.svg")).toBe(false);
    expect(contentTypeAllowed("document", "application/pdf; charset=binary", "Notes.PDF")).toBe(
      true
    );
    expect(contentTypeAllowed("file", "application/zip", "kit.zip")).toBe(true);
    expect(contentTypeAllowed("video", "video/x-msvideo", "old.avi")).toBe(false);
  });

  it("splits large non video files into 10 MB parts", () => {
    expect(contentUsesMultipart("audio", 99 * MB)).toBe(false);
    expect(contentUsesMultipart("audio", 100 * MB)).toBe(true);
    expect(contentUsesMultipart("video", 900 * MB)).toBe(false);
    expect(contentPartCount(100 * MB)).toBe(10);
    expect(contentPartCount(100 * MB + 1)).toBe(11);
  });

  it("builds incoming keys from the public id, never a user id", () => {
    expect(contentIncomingKey("abcdefghijklmnop", "MP3")).toBe(
      "incoming/abcdefghijklmnop/original.mp3"
    );
  });

  it("makes 16 character public ids from a to z and 0 to 9", () => {
    const ids = new Set(Array.from({ length: 500 }, () => newContentPublicId()));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]{16}$/);
  });

  it("encodes base64url and UTF-8 exactly like Node", () => {
    for (let i = 0; i < 200; i += 1) {
      const bytes = randomBytes(i % 37);
      const encoded = base64UrlEncodeBytes(bytes);
      expect(encoded).toBe(bytes.toString("base64url"));
      expect(Buffer.from(base64UrlDecodeBytes(encoded)!)).toEqual(bytes);
    }
    const text = "Point Reyes, new moon session 🌊 é 日本";
    expect(Buffer.from(utf8Encode(text))).toEqual(Buffer.from(text, "utf8"));
    expect(utf8Decode(Buffer.from(text, "utf8"))).toBe(text);
    expect(utf8Decode(Uint8Array.from([0xc3]))).toBeNull();
    expect(utf8Decode(Uint8Array.from([0xed, 0xa0, 0x80]))).toBeNull();
  });

  it("round trips a token payload", () => {
    const payload = {
      k: "derived/abc/COVER/640",
      r: "cover",
      exp: 1_900_000_000,
      dl: 0 as const,
      fn: "Studio notes é.pdf",
    };
    expect(decodeMediaTokenPayload(encodeMediaTokenPayload(payload))).toEqual(payload);
    expect(decodeMediaTokenPayload("not*base64")).toBeNull();
    expect(decodeMediaTokenPayload(base64UrlEncodeBytes(utf8Encode('{"k":1}')))).toBeNull();
  });

  it("refuses malformed MEDIA_TOKEN_KEYS", () => {
    expect(parseMediaTokenKeys(`${key("k1")}, ${key("k2")}`).map(k => k.kid)).toEqual(["k1", "k2"]);
    expect(() => parseMediaTokenKeys("k1:short")).toThrow(/32 bytes/);
    expect(() => parseMediaTokenKeys(`K1:${base64UrlEncodeBytes(randomBytes(48))}`)).toThrow(/kid/);
    expect(() => parseMediaTokenKeys(`${key("k1")},${key("k1")}`)).toThrow(/duplicate/);
  });
});

describe("media gateway tokens", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  const exp = Math.floor(now.getTime() / 1000) + 300;
  const payload = { k: "audio/abc/full.m4a", r: "audio", exp, dl: 0 as const };

  it("signs v1.kid.payload.sig and verifies with the same key", () => {
    const keys = parseMediaTokenKeys(key("k1"));
    const token = signMediaToken(payload, keys);
    expect(token.split(".")).toHaveLength(4);
    expect(token.startsWith("v1.k1.")).toBe(true);
    expect(verifyMediaToken(token, keys, now)).toEqual(payload);
  });

  it("keeps old tokens valid during rotation and signs with the first key", () => {
    const oldKey = key("old");
    const oldToken = signMediaToken(payload, parseMediaTokenKeys(oldKey));
    const rotated = parseMediaTokenKeys(`${key("new")},${oldKey}`);
    expect(verifyMediaToken(oldToken, rotated, now)).toEqual(payload);
    expect(signMediaToken(payload, rotated).startsWith("v1.new.")).toBe(true);
  });

  it("refuses a changed payload, an unknown kid and an expired token", () => {
    const keys = parseMediaTokenKeys(key("k1"));
    const token = signMediaToken(payload, keys);
    const [v, kid, , sig] = token.split(".");
    const forged = encodeMediaTokenPayload({ ...payload, k: "originals/other/original.pdf" });
    expect(verifyMediaToken(`${v}.${kid}.${forged}.${sig}`, keys, now)).toBeNull();
    expect(verifyMediaToken(token, parseMediaTokenKeys(key("k2")), now)).toBeNull();
    expect(verifyMediaToken(token, keys, new Date((exp + 1) * 1000))).toBeNull();
    expect(verifyMediaToken("garbage", keys, now)).toBeNull();
  });

  it("builds gateway URLs with an encoded path and token", () => {
    expect(
      mediaUrl("derived/abc/COVER/640", "v1.k1.a.b", "https://media.ampedusercontent.com/")
    ).toBe("https://media.ampedusercontent.com/derived/abc/COVER/640?t=v1.k1.a.b");
  });
});

describe("processor callback signature", () => {
  const secret = "processor-secret-for-tests";
  const now = new Date("2026-10-12T12:00:00Z");
  const body = JSON.stringify({ publicId: "abcdefghijklmnop", step: "done", outcome: "ok" });

  it("verifies its own signature over the exact bytes", () => {
    const header = signProcessorCallback(body, secret, now);
    expect(header).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    expect(verifyProcessorCallback(Buffer.from(body), header, secret, now)).toBe(true);
  });

  it("refuses a changed body, a wrong secret, an old timestamp or no header", () => {
    const header = signProcessorCallback(body, secret, now);
    expect(verifyProcessorCallback(body + " ", header, secret, now)).toBe(false);
    expect(verifyProcessorCallback(body, header, "other", now)).toBe(false);
    expect(
      verifyProcessorCallback(body, header, secret, new Date(now.getTime() + 6 * 60_000))
    ).toBe(false);
    expect(verifyProcessorCallback(body, undefined, secret, now)).toBe(false);
    expect(verifyProcessorCallback(body, header, "", now)).toBe(false);
  });
});

describe("Stream webhook signature", () => {
  const secret = "stream-webhook-secret";
  const now = new Date("2026-10-12T12:00:00Z");
  const time = Math.floor(now.getTime() / 1000);
  const body = '{"uid":"6b9e68b07dfee8cc2d116e4c51d6a957","readyToStream":true}\n';
  const sig = createHmac("sha256", secret).update(`${time}.${body}`).digest("hex");

  it("accepts Cloudflare's format: time and sig1 over time.body, newline included", () => {
    expect(
      verifyStreamWebhookSignature(Buffer.from(body), `time=${time},sig1=${sig}`, secret, now)
    ).toBe(true);
  });

  it("refuses a trimmed body, a stale time, a bad signature and a missing secret", () => {
    expect(verifyStreamWebhookSignature(body.trim(), `time=${time},sig1=${sig}`, secret, now)).toBe(
      false
    );
    expect(
      verifyStreamWebhookSignature(
        body,
        `time=${time},sig1=${sig}`,
        secret,
        new Date(now.getTime() + 10 * 60_000)
      )
    ).toBe(false);
    expect(
      verifyStreamWebhookSignature(body, `time=${time},sig1=${"0".repeat(64)}`, secret, now)
    ).toBe(false);
    expect(verifyStreamWebhookSignature(body, `time=${time},sig1=${sig}`, "", now)).toBe(false);
  });
});

describe("Stream playback tokens", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const now = new Date("2026-10-12T12:00:00Z");

  it("signs an RS256 JWT with sub, kid, nbf and exp that the public key verifies", () => {
    const token = signStreamToken({ uid: "abc123", expiresInSeconds: 600, now }, "key-1", pem);
    const [header, payload, signature] = token.split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({
      alg: "RS256",
      kid: "key-1",
    });
    const claims = JSON.parse(Buffer.from(payload!, "base64url").toString());
    const nowSec = Math.floor(now.getTime() / 1000);
    expect(claims).toEqual({ sub: "abc123", kid: "key-1", nbf: nowSec - 60, exp: nowSec + 600 });
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${payload}`);
    expect(verifier.verify(publicKey, Buffer.from(signature!, "base64url"))).toBe(true);
  });

  it("marks download tokens and accepts the base64 PEM Cloudflare returns", () => {
    const base64Pem = Buffer.from(pem).toString("base64");
    expect(streamSigningPem(base64Pem)).toBe(pem.trim());
    const token = signStreamToken(
      { uid: "abc", expiresInSeconds: 120, downloadable: true, now },
      "k",
      base64Pem
    );
    const claims = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString());
    expect(claims.downloadable).toBe(true);
  });

  it("refuses to sign without a key", () => {
    expect(() => signStreamToken({ uid: "abc", expiresInSeconds: 60 }, "", "")).toThrow(
      /not configured/
    );
  });
});

describe("Stream direct creator upload", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends only the documented metadata keys, base64 encoded", () => {
    const metadata = streamUploadMetadata({
      size: 1000,
      maxDurationSeconds: 600,
      expiresAt: new Date("2026-10-12T18:00:00.000Z"),
    });
    expect(metadata).toBe(
      `maxDurationSeconds ${Buffer.from("600").toString("base64")},requiresignedurls,expiry ${Buffer.from("2026-10-12T18:00:00Z").toString("base64")}`
    );
  });

  it("reads the uid from stream-media-id or the Location path", () => {
    const uid = "6b9e68b07dfee8cc2d116e4c51d6a957";
    expect(streamUidFrom("https://upload.videodelivery.net/tus/x", uid)).toBe(uid);
    expect(streamUidFrom(`https://upload.videodelivery.net/tus/${uid}?tusv2=true`, null)).toBe(uid);
    expect(streamUidFrom("https://upload.videodelivery.net/tus/nope", null)).toBeNull();
  });

  it("POSTs a TUS creation request and returns the one time URL", async () => {
    Object.assign(env, { CF_ACCOUNT_ID: "acct", CF_STREAM_API_TOKEN: "token" });
    const uid = "6b9e68b07dfee8cc2d116e4c51d6a957";
    const fetchMock = vi.fn(async () => {
      return new Response(null, {
        status: 201,
        headers: {
          location: `https://upload.videodelivery.net/tus/${uid}`,
          "stream-media-id": uid,
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await createStreamDirectUpload({
      size: 5_000_000,
      maxDurationSeconds: 1800,
      expiresAt: new Date("2026-10-12T18:00:00Z"),
    });
    expect(result).toEqual({ uploadUrl: `https://upload.videodelivery.net/tus/${uid}`, uid });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/acct/stream?direct_user=true");
    const headers = init.headers as Record<string, string>;
    expect(headers["Tus-Resumable"]).toBe("1.0.0");
    expect(headers["Upload-Length"]).toBe("5000000");
    expect(headers.Authorization).toBe("Bearer token");
  });
});

describe("R2 multipart part URLs", () => {
  afterEach(() => setR2ClientForTests(null));

  it("gives every part 10 MB and the last part the remainder", () => {
    const size = 25 * MB + 7;
    expect(r2PartLength(size, 1)).toBe(CONTENT_UPLOAD.partBytes);
    expect(r2PartLength(size, 3)).toBe(5 * MB + 7);
    expect(() => r2PartLength(size, 4)).toThrow();
    expect(() => r2PartLength(size, 0)).toThrow();
  });

  it("binds each presigned part URL to its exact length", async () => {
    Object.assign(env, { R2_BUCKET: "amped-content-test" });
    setR2ClientForTests(
      new S3Client({
        region: "auto",
        endpoint: "https://acct.r2.cloudflarestorage.com",
        credentials: { accessKeyId: "AKIATESTTESTTESTTEST", secretAccessKey: "x".repeat(40) },
        requestChecksumCalculation: "WHEN_REQUIRED",
        forcePathStyle: true,
      })
    );
    const parts = await presignR2Parts("incoming/abc/original.zip", "upload-1", 25 * MB, [1, 3]);
    expect(parts.map(part => part.partNumber)).toEqual([1, 3]);
    for (const part of parts) {
      const url = new URL(part.url);
      expect(url.host).toBe("acct.r2.cloudflarestorage.com");
      expect(url.pathname).toBe("/amped-content-test/incoming/abc/original.zip");
      expect(url.searchParams.get("uploadId")).toBe("upload-1");
      expect(url.searchParams.get("partNumber")).toBe(String(part.partNumber));
      expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("content-length");
      expect(url.searchParams.get("X-Amz-Expires")).toBe(String(CONTENT_UPLOAD.presignTtlSeconds));
      expect(
        [...url.searchParams.keys()].some(k => k.toLowerCase().startsWith("x-amz-checksum"))
      ).toBe(false);
    }
  });
});
