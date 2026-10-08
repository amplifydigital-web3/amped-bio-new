import { prisma } from "@repo/database";
import { cache } from "../utils/cache";

/**
 * Screen Review 074 D3 (approved 30 Sep): /sign accepts SIGN_MESSAGE only from
 * the site or a redirect URI origin of an enabled registered app in the OAuth
 * app registry. Every other origin stops before the message shows.
 */
export type SignOriginResult =
  | { registered: true; appName: string; icon: string | null }
  | { registered: false };

// Redirect URIs are stored as a JSON array string (schema: OauthClient.redirectUris)
function parseRedirectUris(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

type RegisteredOrigin = { origin: string; appName: string; icon: string | null };

const REGISTRY_KEY = "sign_origin_registry";
const REGISTRY_TTL_SECONDS = 60;

/** The origin of a URL, lowercased, or null when it is not an http(s) URL. */
export function originOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

async function loadRegistry(): Promise<RegisteredOrigin[]> {
  const hit = await cache.get<RegisteredOrigin[]>(REGISTRY_KEY);
  if (hit) return hit;
  const clients = await prisma.oauthClient.findMany({
    where: { OR: [{ disabled: false }, { disabled: null }] },
    select: { name: true, icon: true, uri: true, redirectUris: true, clientId: true },
  });
  const registry: RegisteredOrigin[] = [];
  for (const client of clients) {
    const appName = client.name || client.clientId;
    const origins = new Set(
      [client.uri, ...parseRedirectUris(client.redirectUris)]
        .map(originOf)
        .filter((origin): origin is string => !!origin)
    );
    for (const origin of origins) registry.push({ origin, appName, icon: client.icon ?? null });
  }
  await cache.set(REGISTRY_KEY, registry, REGISTRY_TTL_SECONDS);
  return registry;
}

/** Looks the SIGN_MESSAGE event origin up in the registry. Throws on a failed read. */
export async function checkSignOrigin(origin: string): Promise<SignOriginResult> {
  const normalized = originOf(origin);
  if (!normalized) return { registered: false };
  const match = (await loadRegistry()).find(entry => entry.origin === normalized);
  return match
    ? { registered: true, appName: match.appName, icon: match.icon }
    : { registered: false };
}
