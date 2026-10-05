"use client";

import { useMemo } from "react";

/**
 * Query parameters the OAuth provider appends when it redirects a user to the
 * hosted login, consent or device pages.
 *
 * The same values (including the signed `oauth_query`) must be kept in the URL
 * because the auth client forwards them back when the page calls a provider
 * endpoint, which is what lets the flow continue.
 */
export interface OAuthFlowQuery {
  clientId: string | null;
  scopes: string[];
  claims: string | null;
  oauthQuery: string | null;
  /** The raw query string, preserved verbatim. */
  search: string;
}

function readSearch(): string {
  if (typeof window === "undefined") return "";
  return window.location.search;
}

export function useOAuthFlowQuery(): OAuthFlowQuery {
  const search = readSearch();

  return useMemo(() => {
    const params = new URLSearchParams(search);
    const scope = params.get("scope");

    return {
      clientId: params.get("client_id"),
      scopes: scope ? scope.split(" ").filter(Boolean) : [],
      claims: params.get("claims"),
      oauthQuery: params.get("oauth_query"),
      search,
    };
  }, [search]);
}

/**
 * Provider endpoints answer fetch/XHR callers with `{ redirect: true, url }`
 * instead of a 302, so hosted pages have to perform the navigation themselves.
 */
export function navigateToProviderRedirect(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;

  const url = (data as { url?: unknown }).url;
  if (typeof url !== "string" || url.length === 0) return false;

  window.location.href = url;
  return true;
}
