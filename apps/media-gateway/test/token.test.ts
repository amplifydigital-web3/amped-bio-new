/**
 * Token verification in workerd (spec 3.6). The shared vectors were signed the way
 * the API signs (node:crypto), and apps/server content-tokens.test.ts checks that
 * signMediaToken produces exactly these tokens. Passing here proves the two
 * runtimes agree byte for byte.
 */
import { describe, it, expect } from "vitest";
import { encodeMediaTokenPayload } from "@repo/constants/src/mediaToken";
import { verificationKeys, verifyToken } from "../src/token";
import { signForTest } from "./sign";
import vectors from "./fixtures/token-vectors.json";

const keysFor = (value: string) => verificationKeys(value);

describe("shared vectors from the API signer", () => {
  it.each(vectors.vectors)("accepts: $note", async vector => {
    const keys = await keysFor(vectors.keys);
    const check = await verifyToken(vector.token, keys, vector.payload.exp - 600);
    expect(check).toEqual({ ok: true, payload: vector.payload });
  });

  it("matches the test signer, so integration tests mint real tokens", async () => {
    for (const vector of vectors.vectors) {
      expect(await signForTest(vector.payload as never, vector.kid, vectors.keys)).toBe(
        vector.token
      );
    }
  });
});

describe("refusals", () => {
  const vector = vectors.vectors[0]!;
  const now = vector.payload.exp - 600;

  it("refuses a changed payload, a changed signature and a non canonical signature", async () => {
    const keys = await keysFor(vectors.keys);
    const [v, kid, , sig] = vector.token.split(".");
    const forged = encodeMediaTokenPayload({
      ...vector.payload,
      k: "audio/zzzzzzzzzzzzzzzz/full.m4a",
    } as never);
    expect(await verifyToken(`${v}.${kid}.${forged}.${sig}`, keys, now)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
    const flipped = sig!.startsWith("A") ? `B${sig!.slice(1)}` : `A${sig!.slice(1)}`;
    expect(
      (await verifyToken(`${v}.${kid}.${vector.token.split(".")[2]}.${flipped}`, keys, now)).ok
    ).toBe(false);
    // 43 characters carry 32 bytes plus 2 spare bits; setting one is a second spelling
    const last = sig!.at(-1)!;
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const spare = alphabet[alphabet.indexOf(last) | 1]!;
    if (spare !== last) {
      expect(await verifyToken(`${vector.token.slice(0, -1)}${spare}`, keys, now)).toEqual({
        ok: false,
        reason: "malformed",
      });
    }
  });

  it("refuses an unknown kid, a removed key and garbage", async () => {
    const onlyT1 = await keysFor(vectors.keys.split(",")[1]!);
    expect(await verifyToken(vector.token, onlyT1, now)).toEqual({
      ok: false,
      reason: "unknown_kid",
    });
    const keys = await keysFor(vectors.keys);
    for (const garbage of ["", "v1", "v2.t2.a.b", "v1.T2.a.b", "v1.t2..b", "v1.t2.a.b.c"]) {
      expect((await verifyToken(garbage, keys, now)).ok).toBe(false);
    }
  });

  it("refuses an expired token and one that lives past 25 hours", async () => {
    const keys = await keysFor(vectors.keys);
    expect(await verifyToken(vector.token, keys, vector.payload.exp)).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(await verifyToken(vector.token, keys, vector.payload.exp - 25 * 3600 - 1)).toEqual({
      ok: false,
      reason: "too_long",
    });
    expect((await verifyToken(vector.token, keys, vector.payload.exp - 25 * 3600)).ok).toBe(true);
  });

  it("refuses a download without a jti and a jti outside the format", async () => {
    const keys = await keysFor(vectors.keys);
    const base = { k: "originals/abcdefghijklmnop/original.pdf", r: "original", exp: now + 120 };
    const noJti = await signForTest({ ...base, dl: 1 }, undefined, vectors.keys);
    expect(await verifyToken(noJti, keys, now)).toEqual({ ok: false, reason: "malformed" });
    const badJti = await signForTest({ ...base, dl: 1, j: "short" }, undefined, vectors.keys);
    expect(await verifyToken(badJti, keys, now)).toEqual({ ok: false, reason: "malformed" });
  });

  it("refuses to start with missing or weak keys", async () => {
    await expect(verificationKeys("")).rejects.toThrow(/empty/);
    await expect(verificationKeys("k1:c2hvcnQ")).rejects.toThrow(/32 bytes/);
  });
});
