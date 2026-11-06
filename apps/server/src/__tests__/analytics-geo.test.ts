/**
 * Analytics location: every visitor showed as United States with an Unknown
 * city because the API geolocated its own proxy's private address. These
 * tests use the real bundled GeoLite2 data (fast-geoip), so no network.
 */
import { describe, expect, it } from "vitest";
import type { Request } from "express";
import {
  getVisitorIp,
  isCloudflareIp,
  isPublicIp,
  normalizeIp,
} from "../services/analytics/visitorIp";
import { resolveLocation } from "../services/analytics/geo";

const TRAEFIK = "10.0.1.7"; // Coolify's Docker network
const CF_EDGE = "172.70.1.1";
const FORT_LAUDERDALE = "73.0.0.1";
const BELFAST = "2.125.160.216";

function req(socket: string, headers: Record<string, string> = {}): Request {
  return { socket: { remoteAddress: socket }, headers } as unknown as Request;
}

describe("getVisitorIp", () => {
  it("walks past the Coolify proxy to the visitor", () => {
    const r = req(`::ffff:${TRAEFIK}`, { "x-forwarded-for": FORT_LAUDERDALE });
    expect(getVisitorIp(r)).toEqual({ ip: FORT_LAUDERDALE, viaCloudflare: false });
  });

  it("walks past Traefik and a Cloudflare edge", () => {
    const r = req(TRAEFIK, { "x-forwarded-for": `${BELFAST}, ${CF_EDGE}` });
    expect(getVisitorIp(r)).toEqual({ ip: BELFAST, viaCloudflare: true });
  });

  it("prefers CF-Connecting-IP once a Cloudflare hop is confirmed", () => {
    const r = req(TRAEFIK, {
      "x-forwarded-for": `9.9.9.9, ${CF_EDGE}`,
      "cf-connecting-ip": BELFAST,
    });
    expect(getVisitorIp(r).ip).toBe(BELFAST);
  });

  it("ignores CF-Connecting-IP when no Cloudflare hop was seen", () => {
    const r = req(TRAEFIK, { "x-forwarded-for": FORT_LAUDERDALE, "cf-connecting-ip": BELFAST });
    expect(getVisitorIp(r).ip).toBe(FORT_LAUDERDALE);
  });

  it("does not let a visitor spoof their address with X-Forwarded-For", () => {
    // The visitor sent "1.1.1.1"; Traefik appended the real address
    const r = req(TRAEFIK, { "x-forwarded-for": `1.1.1.1, ${FORT_LAUDERDALE}` });
    expect(getVisitorIp(r).ip).toBe(FORT_LAUDERDALE);
  });

  it("uses the socket when the visitor connects directly", () => {
    const r = req(FORT_LAUDERDALE, { "x-forwarded-for": BELFAST });
    expect(getVisitorIp(r).ip).toBe(FORT_LAUDERDALE);
  });

  it("returns no IP when only proxies are present", () => {
    expect(getVisitorIp(req(TRAEFIK)).ip).toBe("");
    expect(getVisitorIp(req("127.0.0.1", { "x-forwarded-for": "192.168.1.4" })).ip).toBe("");
  });
});

describe("ip helpers", () => {
  it("classifies addresses", () => {
    expect(isPublicIp(TRAEFIK)).toBe(false);
    expect(isPublicIp("100.64.3.2")).toBe(false);
    expect(isPublicIp("fd00::1")).toBe(false);
    expect(isPublicIp(FORT_LAUDERDALE)).toBe(true);
    expect(isCloudflareIp(CF_EDGE)).toBe(true);
    expect(isCloudflareIp("2606:4700::1")).toBe(true);
    expect(isCloudflareIp(FORT_LAUDERDALE)).toBe(false);
  });

  it("normalizes mapped, bracketed and ported addresses", () => {
    expect(normalizeIp("::ffff:10.0.1.7")).toBe("10.0.1.7");
    expect(normalizeIp("[2001:db8::1]:443")).toBe("2001:db8::1");
    expect(normalizeIp("73.0.0.1:5123")).toBe("73.0.0.1");
    expect(normalizeIp("unknown")).toBe("");
  });
});

describe("resolveLocation", () => {
  it("resolves country and city from the visitor IP", async () => {
    expect(await resolveLocation(req(TRAEFIK), FORT_LAUDERDALE)).toEqual({
      country: "US",
      city: "Fort Lauderdale",
      source: "geoip",
    });
    expect(await resolveLocation(req(TRAEFIK), BELFAST)).toMatchObject({
      country: "GB",
      city: "Belfast",
    });
  });

  it("never geolocates proxy or private addresses (the United States bug)", async () => {
    for (const ip of [TRAEFIK, "172.18.0.2", "192.168.1.10", "127.0.0.1", CF_EDGE]) {
      expect(await resolveLocation(req(TRAEFIK), ip)).toEqual({
        country: null,
        city: null,
        source: "none",
      });
    }
  });

  it("does not guess for IPv6, which the bundled data cannot resolve", async () => {
    expect((await resolveLocation(req(TRAEFIK), "2001:4860:4860::8888")).country).toBeNull();
  });

  it("uses Cloudflare headers only when the request came through Cloudflare", async () => {
    const headers = { "cf-ipcountry": "DE", "cf-ipcity": "M%C3%BCnchen" };
    expect(await resolveLocation(req(TRAEFIK, headers), FORT_LAUDERDALE, true)).toEqual({
      country: "DE",
      city: "München",
      source: "cloudflare",
    });
    // Spoofed header on a direct request is ignored
    expect(await resolveLocation(req(TRAEFIK, headers), FORT_LAUDERDALE, false)).toMatchObject({
      country: "US",
      city: "Fort Lauderdale",
    });
  });

  it("fills the city from GeoLite2 when Cloudflare sends only the country", async () => {
    const r = req(TRAEFIK, { "cf-ipcountry": "GB" });
    expect(await resolveLocation(r, BELFAST, true)).toEqual({
      country: "GB",
      city: "Belfast",
      source: "cloudflare",
    });
    // Countries disagree: keep Cloudflare's country, no city
    expect(await resolveLocation(r, FORT_LAUDERDALE, true)).toEqual({
      country: "GB",
      city: null,
      source: "cloudflare",
    });
  });

  it("treats Cloudflare's unknown and Tor codes as no location", async () => {
    const r = req(TRAEFIK, { "cf-ipcountry": "XX" });
    expect((await resolveLocation(r, "", true)).country).toBeNull();
  });
});
