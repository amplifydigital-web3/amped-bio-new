import type { Request } from "express";

export type GeoLocation = {
  country: string | null;
  city: string | null;
};

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
  try {
    return decodeURIComponent(value).slice(0, 100) || null;
  } catch {
    return value.slice(0, 100) || null;
  }
}

type FastGeoIp = {
  lookup: (ip: string) => Promise<{ country?: string; city?: string } | null>;
};

let geoIpModule: Promise<FastGeoIp | null> | null = null;

function loadGeoIp(): Promise<FastGeoIp | null> {
  if (!geoIpModule) {
    geoIpModule = import("fast-geoip")
      .then(mod => (mod as { default?: FastGeoIp }).default ?? (mod as unknown as FastGeoIp))
      .catch(error => {
        console.warn(
          "[ANALYTICS] fast-geoip unavailable, location will rely on edge headers",
          error
        );
        return null;
      });
  }
  return geoIpModule;
}

/**
 * Resolves a coarse location. Edge headers (Cloudflare, Vercel, CloudFront)
 * are preferred; the bundled GeoLite2 database is the fallback. Only the
 * country code and city name are kept.
 */
export async function resolveLocation(req: Request, ip: string): Promise<GeoLocation> {
  const headerCountry = normalizeCountry(
    header(req, "cf-ipcountry") ??
      header(req, "x-vercel-ip-country") ??
      header(req, "cloudfront-viewer-country")
  );
  const headerCity = normalizeCity(header(req, "cf-ipcity") ?? header(req, "x-vercel-ip-city"));

  if (headerCountry) {
    return { country: headerCountry, city: headerCity };
  }

  if (!ip) return { country: null, city: null };

  try {
    const geoip = await loadGeoIp();
    const result = geoip ? await geoip.lookup(ip.replace(/^::ffff:/, "")) : null;
    return {
      country: normalizeCountry(result?.country),
      city: normalizeCity(result?.city),
    };
  } catch {
    return { country: null, city: null };
  }
}
