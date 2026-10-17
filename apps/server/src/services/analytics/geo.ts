import { isIP } from "node:net";
import type { Request } from "express";
import { isCloudflareIp, isPublicIp } from "./visitorIp";

export type GeoLocation = {
  country: string | null;
  city: string | null;
};

export type GeoSource = "cloudflare" | "geoip" | "none";

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

type GeoIpRecord = {
  range?: [number, number];
  country?: string;
  region?: string;
  city?: string;
};
type FastGeoIp = { lookup: (ip: string) => Promise<GeoIpRecord | null> };

let geoIpModule: Promise<FastGeoIp | null> | null = null;

function loadGeoIp(): Promise<FastGeoIp | null> {
  if (!geoIpModule) {
    geoIpModule = import("fast-geoip")
      .then(mod => (mod as { default?: FastGeoIp }).default ?? (mod as unknown as FastGeoIp))
      .catch(error => {
        console.warn(
          "[ANALYTICS] fast-geoip unavailable, location will rely on Cloudflare headers",
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
 * Looks an address up in the bundled GeoLite2 data. fast-geoip only handles
 * IPv4 and answers every query with the nearest range, so private and
 * unallocated addresses come back as a real country. Those are filtered here:
 * only public IPv4 addresses that fall inside the returned range are used.
 */
async function lookupGeoIp(ip: string): Promise<GeoLocation | null> {
  if (isIP(ip) !== 4 || !isPublicIp(ip) || isCloudflareIp(ip)) return null;
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

let warnedNoPublicIp = false;

/**
 * Resolves a coarse location for the visitor. Only the country code and city
 * name are kept.
 *
 * 1. Cloudflare's CF-IPCountry and CF-IPCity headers, read only when the
 *    request actually passed through a Cloudflare edge (otherwise a client
 *    could set them). CF-IPCity needs the "Add visitor location headers"
 *    managed transform; without it the city comes from GeoLite2 below.
 * 2. The bundled GeoLite2 data (fast-geoip) for the visitor's public IPv4.
 *
 * Private, proxy and IPv6 addresses never produce a location: the visit is
 * stored with no location (shown as Unknown) instead of a wrong one.
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
    geoip = ip ? await lookupGeoIp(ip) : null;
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

/**
 * Country and first level subdivision (a US state code) for one public IPv4
 * address, from the bundled GeoLite2 data. Buy USDC (Build Board #5) uses it
 * to ask Coinbase which payment methods serve the fan's region. Nothing is
 * stored. Null for private, proxy, IPv6 and unknown addresses.
 */
export async function lookupRegion(
  ip: string
): Promise<{ country: string; subdivision: string | null } | null> {
  if (isIP(ip) !== 4 || !isPublicIp(ip) || isCloudflareIp(ip)) return null;
  const geoip = await loadGeoIp();
  if (!geoip) return null;
  const record = await geoip.lookup(ip).catch(() => null);
  if (!record) return null;
  if (record.range) {
    const value = ipv4ToNumber(ip);
    if (value < record.range[0] || value >= record.range[1]) return null;
  }
  const country = normalizeCountry(record.country);
  if (!country) return null;
  const subdivision =
    record.region && /^[A-Z0-9]{1,3}$/i.test(record.region) ? record.region.toUpperCase() : null;
  return { country, subdivision };
}
