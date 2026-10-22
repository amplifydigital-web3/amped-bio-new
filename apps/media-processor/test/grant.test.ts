/**
 * Job grants and the R2 outbound handler (spec 3.5): the container may only read
 * its item's upload and write its item's outputs, with a valid unexpired grant.
 */
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:workers";
import { handleR2Outbound, OUTBOUND_PUT_MAX_BYTES } from "../src/container";
import { GRANT_HEADER, GRANT_TTL_SECONDS, keyAllowed, signGrant, verifyGrant } from "../src/grant";

const ID = "grantgrantgrant1";
const OTHER = "othergrantother1";
const SECRET = "processor-test-secret";

describe("grants", () => {
  it("verifies its own grant and returns the public id", async () => {
    const grant = await signGrant(ID, SECRET);
    expect(await verifyGrant(grant, SECRET)).toBe(ID);
  });

  it("refuses an expired, tampered or foreign grant", async () => {
    const now = 1_800_000_000;
    const grant = await signGrant(ID, SECRET, now);
    expect(await verifyGrant(grant, SECRET, now + GRANT_TTL_SECONDS + 1)).toBeNull();
    expect(await verifyGrant(grant, "another-secret", now)).toBeNull();
    expect(await verifyGrant(grant.replace(ID, OTHER), SECRET, now)).toBeNull();
    const [id, exp, sig] = grant.split(".");
    expect(await verifyGrant(`${id}.${Number(exp) + 3600}.${sig}`, SECRET, now)).toBeNull();
    expect(await verifyGrant(`${grant}.x`, SECRET, now)).toBeNull();
    expect(await verifyGrant(null, SECRET, now)).toBeNull();
    expect(await verifyGrant(grant, "", now)).toBeNull();
  });

  it("allows reads of incoming/ and writes of outputs, for its item only", () => {
    expect(keyAllowed("GET", `incoming/${ID}/original.mp3`, ID)).toBe(true);
    expect(keyAllowed("GET", `incoming/${ID}/poster.jpg`, ID)).toBe(true);
    expect(keyAllowed("PUT", `derived/${ID}/rendition/640.webp`, ID)).toBe(true);
    expect(keyAllowed("PUT", `audio/${ID}/full.m4a`, ID)).toBe(true);
    expect(keyAllowed("PUT", `originals/${ID}/original.pdf`, ID)).toBe(true);

    expect(keyAllowed("GET", `originals/${ID}/original.pdf`, ID)).toBe(false);
    expect(keyAllowed("PUT", `incoming/${ID}/original.mp3`, ID)).toBe(false);
    expect(keyAllowed("PUT", `quarantine/${ID}/original.zip`, ID)).toBe(false);
    expect(keyAllowed("GET", `incoming/${OTHER}/original.mp3`, ID)).toBe(false);
    expect(keyAllowed("PUT", `derived/${ID}/../${OTHER}/x.webp`, ID)).toBe(false);
    expect(keyAllowed("PUT", `derived/${ID}//x.webp`, ID)).toBe(false);
    expect(keyAllowed("DELETE", `derived/${ID}/x.webp`, ID)).toBe(false);
    expect(keyAllowed("GET", `incoming/${ID}`, ID)).toBe(false);
  });
});

describe("r2.internal outbound handler", () => {
  const url = (key: string) => `http://r2.internal/object/${key}`;

  it("serves the item's upload with a valid grant", async () => {
    await env.CONTENT.put(`incoming/${ID}/original.mp3`, "audio bytes", {
      httpMetadata: { contentType: "audio/mpeg" },
    });
    const grant = await signGrant(ID, SECRET);
    const response = await handleR2Outbound(
      new Request(url(`incoming/${ID}/original.mp3`), { headers: { [GRANT_HEADER]: grant } }),
      env
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(await response.text()).toBe("audio bytes");

    const missing = await handleR2Outbound(
      new Request(url(`incoming/${ID}/missing.mp3`), { headers: { [GRANT_HEADER]: grant } }),
      env
    );
    expect(missing.status).toBe(404);
  });

  it("stores an output with its content type", async () => {
    const grant = await signGrant(ID, SECRET);
    const body = new TextEncoder().encode("webp bytes");
    const response = await handleR2Outbound(
      new Request(url(`derived/${ID}/rendition/640.webp`), {
        method: "PUT",
        headers: {
          [GRANT_HEADER]: grant,
          "content-type": "image/webp",
          "content-length": String(body.byteLength),
        },
        body,
      }),
      env
    );
    expect(response.status).toBe(200);
    const stored = await env.CONTENT.get(`derived/${ID}/rendition/640.webp`);
    expect(await stored?.text()).toBe("webp bytes");
    expect(stored?.httpMetadata?.contentType).toBe("image/webp");
  });

  it("refuses without a grant, with another item's grant, or outside the rules", async () => {
    await env.CONTENT.put(`incoming/${OTHER}/original.mp3`, "not yours");
    const grant = await signGrant(ID, SECRET);
    const cases: Array<[string, RequestInit]> = [
      [url(`incoming/${ID}/original.mp3`), {}],
      [url(`incoming/${OTHER}/original.mp3`), { headers: { [GRANT_HEADER]: grant } }],
      [
        url(`incoming/${ID}/original.mp3`),
        { method: "PUT", headers: { [GRANT_HEADER]: grant, "content-length": "1" }, body: "x" },
      ],
      [url(`quarantine/${ID}/original.zip`), { headers: { [GRANT_HEADER]: grant } }],
    ];
    for (const [target, init] of cases) {
      expect((await handleR2Outbound(new Request(target, init), env)).status).toBe(403);
    }
  });

  it("refuses an oversized write before reading the body", async () => {
    const grant = await signGrant(ID, SECRET);
    const response = await handleR2Outbound(
      new Request(url(`derived/${ID}/big.bin`), {
        method: "PUT",
        headers: { [GRANT_HEADER]: grant, "content-length": String(OUTBOUND_PUT_MAX_BYTES + 1) },
        body: "x",
      }),
      env
    );
    expect(response.status).toBe(413);
  });
});
