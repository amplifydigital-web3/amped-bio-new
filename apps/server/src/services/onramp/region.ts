import type { Request } from "express";
import { lookupRegion } from "../analytics/geo";
import { getVisitorIp } from "../analytics/visitorIp";

export type OnrampRegion = { country: string; subdivision: string | null };

function header(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ? raw.trim() : undefined;
}

/**
 * The fan's country and US state for Coinbase's Buy Options (spec 3.5). From
 * Cloudflare's visitor location headers when the request came through
 * Cloudflare, otherwise from the bundled GeoLite2 data. The fan can correct it
 * on the Amount step. Nothing is stored.
 */
export async function regionFromRequest(req: Request): Promise<OnrampRegion | null> {
  const { ip, viaCloudflare } = getVisitorIp(req);
  if (viaCloudflare) {
    const country = header(req, "cf-ipcountry")?.toUpperCase();
    if (country && /^[A-Z]{2}$/.test(country) && country !== "XX" && country !== "T1") {
      const region = header(req, "cf-region-code")?.toUpperCase();
      const fromIp = ip ? await lookupRegion(ip).catch(() => null) : null;
      const subdivision =
        region && /^[A-Z0-9]{1,3}$/.test(region)
          ? region
          : fromIp?.country === country
            ? fromIp.subdivision
            : null;
      return { country, subdivision };
    }
  }
  return ip ? lookupRegion(ip).catch(() => null) : null;
}

/** The address Coinbase gets as clientIp, or undefined behind private hops only. */
export function clientIpFromRequest(req: Request): string | undefined {
  return getVisitorIp(req).ip || undefined;
}
