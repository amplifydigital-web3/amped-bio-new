"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { authClient } from "../auth-client";
import { Button } from "../button";
import { describeOAuthScope } from "./oauth-scopes";
import { navigateToProviderRedirect, useOAuthFlowQuery } from "./use-oauth-flow-query";

interface PublicClient {
  client_id?: string;
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
}

function displayHost(uri?: string): string | null {
  if (!uri) return null;
  try {
    return new URL(uri).host;
  } catch {
    return null;
  }
}

/**
 * Hosted consent screen: shows which application is asking for access and which
 * permissions it wants before the user approves or denies the request.
 */
export function OAuthConsentScreen() {
  const { clientId, scopes, search } = useOAuthFlowQuery();
  const [client, setClient] = useState<PublicClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!clientId) {
        setError("This authorization request is missing its application identifier.");
        setLoading(false);
        return;
      }

      try {
        const response = await authClient.oauth2.publicClient({ query: { client_id: clientId } });
        if (!active) return;

        if (response?.error) {
          setError(response.error.message || "This application is not available.");
        } else {
          setClient((response?.data ?? null) as PublicClient | null);
        }
      } catch {
        if (active) setError("This application is not available.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [clientId]);

  const respond = async (accept: boolean) => {
    setSubmitting(true);
    setError(null);

    try {
      const response = await authClient.oauth2.consent({
        accept,
        scope: accept ? scopes.join(" ") : undefined,
      });

      if (response?.error) {
        setError(response.error.message || "Unable to complete the request.");
        return;
      }

      if (!navigateToProviderRedirect(response?.data)) {
        setError("Unable to complete the request.");
      }
    } catch (consentError) {
      setError((consentError as Error).message || "Unable to complete the request.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10" data-oauth-query={search}>
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" aria-hidden="true" />
      </div>
    );
  }

  const host = displayHost(client?.client_uri);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-md border border-gray-200 p-3">
        {client?.logo_uri ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={client.logo_uri} alt="" className="h-10 w-10 rounded" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded bg-gray-100 text-sm font-semibold text-gray-600">
            {(client?.client_name ?? "App").slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900">{client?.client_name ?? clientId}</p>
          {host ? <p className="truncate text-xs text-gray-500">{host}</p> : null}
        </div>
      </div>

      <div>
        <p className="text-sm text-gray-700">
          This application will be able to use your Amped.bio account to:
        </p>
        <ul className="mt-3 space-y-2">
          {scopes.map(scope => {
            const described = describeOAuthScope(scope);
            return (
              <li key={scope} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" aria-hidden="true" />
                <span className="text-sm text-gray-700">
                  <span className="font-medium text-gray-900">{described.title}</span> - {described.description}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={() => void respond(false)} disabled={submitting}>
          Cancel
        </Button>
        <Button className="flex-1" onClick={() => void respond(true)} disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Allow"}
        </Button>
      </div>

      <p className="text-center text-xs text-gray-500">
        You can revoke access at any time from your authorized applications.
      </p>
    </div>
  );
}
