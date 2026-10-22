import { BlockList, isIP } from "node:net";
import type { Request } from "express";

/**
 * Finds the public IP address of the visitor behind our own proxies, for
 * analytics only (location, the daily visitor hash and the collect rate limit).
 *
 * Production runs behind Coolify's Traefik on a private Docker network and may
 * also sit behind Cloudflare. The socket address is then a private proxy
 * address (10.0.1.x on Coolify), which the GeoLite2 data resolves to "US" with
 * no city. That was the cause of every visitor showing as United States.
 *
 * The walk starts at the socket and moves left through X-Forwarded-For while
 * the current hop is one of our proxies (a private address or a Cloudflare
 * edge). The first address that is not a proxy is the visitor. Entries to the
 * left of it were written by the client and are never read, so a visitor
 * cannot claim another address by sending their own X-Forwarded-For.
 *
 * Security decisions (auth rate limits and the like) keep using req.ip and the
 * TRUST_PROXY setting. This helper trusts Cloudflare ranges without
 * configuration, which is acceptable for analytics and nothing else.
 */

// https://www.cloudflare.com/ips/ (IPv4 and IPv6 lists)
const CLOUDFLARE_V4 = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
];

const CLOUDFLARE_V6 = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

// Addresses that never belong to a visitor on the public internet
const NON_PUBLIC_V4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "224.0.0.0/3",
];

const NON_PUBLIC_V6 = ["::/128", "::1/128", "fc00::/7", "fe80::/10", "ff00::/8"];

function blockList(v4: string[], v6: string[]): BlockList {
  const list = new BlockList();
  for (const cidr of v4) {
    const [net, prefix] = cidr.split("/");
    list.addSubnet(net, Number(prefix), "ipv4");
  }
  for (const cidr of v6) {
    const [net, prefix] = cidr.split("/");
    list.addSubnet(net, Number(prefix), "ipv6");
  }
  return list;
}

const cloudflare = blockList(CLOUDFLARE_V4, CLOUDFLARE_V6);
const nonPublic = blockList(NON_PUBLIC_V4, NON_PUBLIC_V6);

/** Strips the IPv4-mapped IPv6 prefix, brackets and ports. Returns "" if not an IP. */
export function normalizeIp(value?: string | null): string {
  if (!value) return "";
  let ip = value.trim();
  if (ip.startsWith("[")) ip = ip.slice(1, ip.indexOf("]"));
  // "1.2.3.4:5678" (some proxies append the port to IPv4)
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) ip = ip.slice(0, ip.lastIndexOf(":"));
  ip = ip.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "");
  return isIP(ip) ? ip : "";
}

function family(ip: string): "ipv4" | "ipv6" | null {
  const version = isIP(ip);
  return version === 4 ? "ipv4" : version === 6 ? "ipv6" : null;
}

export function isCloudflareIp(ip: string): boolean {
  const fam = family(ip);
  return fam ? cloudflare.check(ip, fam) : false;
}

export function isPublicIp(ip: string): boolean {
  const fam = family(ip);
  return fam ? !nonPublic.check(ip, fam) : false;
}

export type VisitorIp = {
  /** The visitor's address, or "" when only proxy addresses were seen */
  ip: string;
  /** True when one of the hops was a Cloudflare edge */
  viaCloudflare: boolean;
};

function forwardedChain(req: Request): string[] {
  const raw = req.headers["x-forwarded-for"];
  const joined = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  return joined
    .split(",")
    .map(part => part.trim())
    .filter(Boolean);
}

export function getVisitorIp(req: Request): VisitorIp {
  const chain = forwardedChain(req);
  let current = normalizeIp(req.socket?.remoteAddress);
  let viaCloudflare = false;

  for (let i = chain.length - 1; i >= -1; i--) {
    if (!current) return { ip: "", viaCloudflare };

    const isProxy = !isPublicIp(current) || isCloudflareIp(current);
    if (!isProxy) return { ip: current, viaCloudflare };
    if (isCloudflareIp(current)) viaCloudflare = true;

    // Cloudflare also sends the address it saw; it is the most reliable value
    // once we know the hop in front of us is Cloudflare
    if (viaCloudflare) {
      const connecting = normalizeIp(
        Array.isArray(req.headers["cf-connecting-ip"])
          ? req.headers["cf-connecting-ip"][0]
          : req.headers["cf-connecting-ip"]
      );
      if (connecting && isPublicIp(connecting)) return { ip: connecting, viaCloudflare };
    }

    if (i < 0) break;
    current = normalizeIp(chain[i]);
  }

  // Only proxies were seen (local development, health checks)
  return { ip: "", viaCloudflare };
}
