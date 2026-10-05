// Shared types and helpers for the developer portal panel.

export interface OAuthClientSummary {
  client_id: string;
  name?: string | null;
  redirectUris?: string | null;
  disabled?: boolean | null;
}

/**
 * Redirect URIs are stored as a JSON encoded array string because MySQL has no
 * array type (see the `string[]` handling in the adapter).
 */
export function parseRedirectUris(value: string | null): string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
