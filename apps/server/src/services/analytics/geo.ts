import { isIP } from "node:net";
import type { Request } from "express";
import { isCloudflareIp, isPublicIp } from "./visitorIp";
import { getGeoIpReader } from "./geoipDatabase";

export type GeoLocation = {
  country: string | null;
  city: string | null;
};

export type GeoSource = "cloudflare" | "geoip" | "none";

// Which database answered a geoip lookup
export type GeoIpEngine = "maxmind" | "bundled";

export type ResolvedGeo = GeoLocation & { source: GeoSource };

function header(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ? raw.trim() : undefined;
}

function normalizeCountry(value?: string | null): string | null {
  if (!value) return null;
  const code = value.toUpperCase();
  // XX and T1 are Cloudflare's codes for unknown and Tor
  if (!/^[A-Z]{2}$/.test(code) || code === "XX" || code === "T1") return null;
  return code;
}

function normalizeCity(value?: string | null): string | null {
  if (!value) return null;
  let city = value;
  try {
    city = decodeURIComponent(value);
  } catch {
    // Keep the raw value
  }
  return city.trim().slice(0, 100) || null;
}

type GeoIpRecord = { range?: [number, number]; country?: string; city?: string };
type FastGeoIp = { lookup: (ip: string) => Promise<GeoIpRecord | null> };

let geoIpModule: Promise<FastGeoIp | null> | null = null;

function loadGeoIp(): Promise<FastGeoIp | null> {
  if (!geoIpModule) {
    geoIpModule = import("fast-geoip")
      .then(mod => (mod as { default?: FastGeoIp }).default ?? (mod as unknown as FastGeoIp))
      .catch(error => {
        console.warn(
          "[ANALYTICS] fast-geoip unavailable, location will rely on GeoLite2 City or Cloudflare headers",
          error
        );
        return null;
      });
  }
  return geoIpModule;
}

function ipv4ToNumber(ip: string): number {
  return ip.split(".").reduce((acc, octet) => acc * 256 + Number(octet), 0);
}

/**
 * Looks an address up in MaxMind GeoLite2 City (IPv4 and IPv6, kept current by
 * geoipDatabase.ts). Proxy, private and Cloudflare addresses are never looked up.
 */
async function lookupMaxMind(ip: string): Promise<GeoLocation | null> {
  const reader = await getGeoIpReader();
  if (!reader) return null;
  const record = reader.get(ip);
  if (!record) return null;
  const country = normalizeCountry(record.country?.iso_code ?? record.registered_country?.iso_code);
  if (!country) return null;
  return { country, city: normalizeCity(record.city?.names?.en) };
}

/**
 * Fallback when no GeoLite2 City database is configured: the GeoLite2 data
 * bundled with fast-geoip. It only handles IPv4 and answers every query with
 * the nearest range, so only addresses inside the returned range are used.
 */
async function lookupBundled(ip: string): Promise<GeoLocation | null> {
  if (isIP(ip) !== 4) return null;
  const geoip = await loadGeoIp();
  if (!geoip) return null;
  const record = await geoip.lookup(ip);
  if (!record) return null;
  if (record.range) {
    const value = ipv4ToNumber(ip);
    if (value < record.range[0] || value >= record.range[1]) return null;
  }
  const country = normalizeCountry(record.country);
  if (!country) return null;
  return { country, city: normalizeCity(record.city) };
}

export async function lookupGeoIp(
  ip: string
): Promise<(GeoLocation & { engine: GeoIpEngine }) | null> {
  if (!isIP(ip) || !isPublicIp(ip) || isCloudflareIp(ip)) return null;
  if (await getGeoIpReader()) {
    const location = await lookupMaxMind(ip);
    return location ? { ...location, engine: "maxmind" } : null;
  }
  const location = await lookupBundled(ip);
  return location ? { ...location, engine: "bundled" } : null;
}

let warnedNoPublicIp = false;

/**
 * Resolves a coarse location for the visitor. Only the country code and city
 * name are kept.
 *
 * 1. Cloudflare's CF-IPCountry and CF-IPCity headers, read only when the
 *    request actually passed through a Cloudflare edge (otherwise a client
 *    could set them). CF-IPCity needs the "Add visitor location headers"
 *    managed transform; without it the city comes from GeoLite2 below.
 * 2. MaxMind GeoLite2 City for the visitor's public IPv4 or IPv6 address,
 *    or the bundled IPv4 data when no GeoLite2 City database is configured.
 *
 * Private and proxy addresses never produce a location: the visit is stored
 * with no location (shown as Unknown) instead of a wrong one.
 */
export async function resolveLocation(
  req: Request,
  ip: string,
  viaCloudflare = false
): Promise<ResolvedGeo> {
  if (!ip && !viaCloudflare && !warnedNoPublicIp) {
    warnedNoPublicIp = true;
    console.warn(
      "[ANALYTICS] No public visitor IP on the request. The proxy in front of the API is not " +
        "forwarding X-Forwarded-For, so visitor locations will be Unknown."
    );
  }

  let geoip: GeoLocation | null = null;
  try {
    const found = ip ? await lookupGeoIp(ip) : null;
    geoip = found ? { country: found.country, city: found.city } : null;
  } catch {
    geoip = null;
  }

  if (viaCloudflare) {
    const country = normalizeCountry(header(req, "cf-ipcountry"));
    if (country) {
      const city =
        normalizeCity(header(req, "cf-ipcity")) ?? (geoip?.country === country ? geoip.city : null);
      return { country, city, source: "cloudflare" };
    }
  }

  if (geoip) return { ...geoip, source: "geoip" };
  return { country: null, city: null, source: "none" };
}
