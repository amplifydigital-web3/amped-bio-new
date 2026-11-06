/**
 * Analytics location with MaxMind GeoLite2 City. The bundled fast-geoip data
 * cannot place IPv6 visitors (most mobile carriers), so they were stored as
 * Unknown. These tests stub the GeoLite2 reader, so no license key or network.
 */
import { afterEach, describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import type { Request } from "express";
import { lookupGeoIp, resolveLocation } from "../services/analytics/geo";
import {
  extractMmdbFromTarGz,
  setGeoIpReaderForTests,
  type CityRecord,
  type GeoIpReader,
} from "../services/analytics/geoipDatabase";

const TRAEFIK = "10.0.1.7";
const LONDON_V6 = "2a00:23c5:1234::1";
const MIAMI_V4 = "73.0.0.1";

function req(headers: Record<string, string> = {}): Request {
  return { socket: { remoteAddress: TRAEFIK }, headers } as unknown as Request;
}

function stubReader(records: Record<string, CityRecord>): GeoIpReader {
  return {
    get: (ip: string) => records[ip] ?? null,
    metadata: { buildEpoch: new Date("2026-10-16T00:00:00Z") },
  } as unknown as GeoIpReader;
}

afterEach(() => setGeoIpReaderForTests(null));

describe("GeoLite2 City lookups", () => {
  it("locates IPv6 visitors", async () => {
    setGeoIpReaderForTests(
      stubReader({
        [LONDON_V6]: { country: { iso_code: "GB" }, city: { names: { en: "London" } } },
      })
    );
    expect(await resolveLocation(req(), LONDON_V6)).toEqual({
      country: "GB",
      city: "London",
      source: "geoip",
    });
    expect(await lookupGeoIp(LONDON_V6)).toMatchObject({ engine: "maxmind" });
  });

  it("uses GeoLite2 City for IPv4 when it is loaded", async () => {
    setGeoIpReaderForTests(
      stubReader({
        [MIAMI_V4]: { country: { iso_code: "US" }, city: { names: { en: "Miami" } } },
      })
    );
    expect(await resolveLocation(req(), MIAMI_V4)).toMatchObject({ country: "US", city: "Miami" });
  });

  it("keeps the country when GeoLite2 has no city", async () => {
    setGeoIpReaderForTests(stubReader({ [MIAMI_V4]: { registered_country: { iso_code: "US" } } }));
    expect(await resolveLocation(req(), MIAMI_V4)).toEqual({
      country: "US",
      city: null,
      source: "geoip",
    });
  });

  it("never looks up proxy, private or Cloudflare addresses", async () => {
    setGeoIpReaderForTests(
      stubReader({
        [TRAEFIK]: { country: { iso_code: "US" } },
        "fd00::1": { country: { iso_code: "US" } },
        "2606:4700::1": { country: { iso_code: "US" } },
      })
    );
    for (const ip of [TRAEFIK, "fd00::1", "2606:4700::1"]) {
      expect((await resolveLocation(req(), ip)).country).toBeNull();
    }
  });

  it("does not fall back to bundled data when GeoLite2 has no record", async () => {
    setGeoIpReaderForTests(stubReader({}));
    expect((await resolveLocation(req(), MIAMI_V4)).country).toBeNull();
  });
});

describe("extractMmdbFromTarGz", () => {
  function tarEntry(name: string, data: Buffer): Buffer {
    const header = Buffer.alloc(512);
    header.write(name, 0, "utf8");
    header.write(data.length.toString(8).padStart(11, "0") + "\0", 124, "utf8");
    const padded = Buffer.alloc(Math.ceil(data.length / 512) * 512);
    data.copy(padded);
    return Buffer.concat([header, padded]);
  }

  it("returns the .mmdb from MaxMind's archive layout", () => {
    const mmdb = Buffer.from("fake mmdb bytes");
    const archive = gzipSync(
      Buffer.concat([
        tarEntry("GeoLite2-City_20261014/COPYRIGHT.txt", Buffer.from("(c) MaxMind")),
        tarEntry("GeoLite2-City_20261014/GeoLite2-City.mmdb", mmdb),
        Buffer.alloc(1024),
      ])
    );
    expect(extractMmdbFromTarGz(archive).equals(mmdb)).toBe(true);
  });

  it("throws when the archive has no database", () => {
    const archive = gzipSync(
      Buffer.concat([tarEntry("README.txt", Buffer.from("x")), Buffer.alloc(1024)])
    );
    expect(() => extractMmdbFromTarGz(archive)).toThrow();
  });
});
