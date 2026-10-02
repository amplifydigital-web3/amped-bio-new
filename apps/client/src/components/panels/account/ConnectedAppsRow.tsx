import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PlugZap } from "lucide-react";
import { Button, EmptyState, ErrorCard, Skeleton, describeOAuthScope, trpc } from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { useDelayed } from "@/hooks/useDelayed";
import { DisclosureRow } from "../design/kit/DisclosureRow";

// D30, Screen Review 092 I16 to I18. Connected apps, row five of the Account
// card: the apps this person allowed to use their Amped.Bio sign in. Moved out
// of the Developers tab, which now holds only the apps a person builds.
// Server side Revoke semantics (D2, ending tokens too) ship with row 092.

export const CONNECTED_APPS_ROW = "connected-apps";

interface Consent {
  id: string;
  clientId?: string;
  clientName?: string | null;
  clientIcon?: string | null;
  clientUri?: string | null;
  scopes?: string | string[];
  createdAt?: string | Date;
}

function scopesOf(consent: Consent) {
  const raw = Array.isArray(consent.scopes)
    ? consent.scopes.join(" ")
    : String(consent.scopes ?? "");
  return raw.split(/[\s,]+/).filter(Boolean);
}

function hostOf(uri?: string | null) {
  if (!uri) return null;
  try {
    return new URL(uri).host;
  } catch {
    return null;
  }
}

function allowedOn(value?: string | Date) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function countLabel(count: number) {
  if (count === 0) return "None";
  return count === 1 ? "1 app" : `${count} apps`;
}

// The icon comes from client registered metadata: render https and data URLs only
function isAllowedIcon(value?: string | null): value is string {
  if (!value) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "data:";
  } catch {
    return false;
  }
}

function AppArt({ consent, name }: { consent: Consent; name: string }) {
  const [broken, setBroken] = useState(false);
  if (isAllowedIcon(consent.clientIcon) && !broken) {
    return (
      <img
        src={consent.clientIcon}
        alt=""
        onError={() => setBroken(true)}
        className="h-[34px] w-[34px] shrink-0 rounded-prism-8 bg-white object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="prism-well flex h-[34px] w-[34px] shrink-0 items-center justify-center !rounded-prism-8 text-prism-label font-bold text-prism-ink-2"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function useConsents() {
  return useQuery(trpc.oauthApps.consents.queryOptions());
}

function ConnectedAppsList() {
  const queryClient = useQueryClient();
  const query = useConsents();
  const showSkeleton = useDelayed(query.isLoading, 400);
  const [revoking, setRevoking] = useState<string | null>(null);

  const revoke = useMutation({
    ...trpc.oauthApps.revokeConsent.mutationOptions(),
    onMutate: ({ id }) => setRevoking(id),
    onSuccess: () => {
      toast.add({ type: "success", title: "Access revoked" });
      void queryClient.invalidateQueries({ queryKey: trpc.oauthApps.consents.queryKey() });
    },
    onError: () =>
      toast.add({
        type: "error",
        title: "Access was not revoked. Check your connection and try again.",
      }),
    onSettled: () => setRevoking(null),
  });

  if (query.isLoading) {
    if (!showSkeleton) return <div className="h-[165px]" aria-busy />;
    return (
      <div aria-busy className="space-y-0">
        {[0, 1, 2].map(index => (
          <div key={index} className="flex h-commit items-center gap-3">
            <Skeleton className="h-[34px] w-[34px] rounded-prism-8" />
            <Skeleton className="h-4 flex-1 rounded-full" />
            <Skeleton className="h-touch w-[88px] rounded-prism-13" />
          </div>
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <ErrorCard
        title="Connected apps did not load"
        cause="Check your connection and try again."
        onRetry={() => void query.refetch()}
        retryLabel="Retry"
      />
    );
  }

  const consents = (query.data ?? []) as unknown as Consent[];
  if (consents.length === 0) {
    return (
      <EmptyState
        icon={PlugZap}
        title="No connected apps yet"
        description="Apps you allow to use your Amped.Bio sign in appear here."
      />
    );
  }

  return (
    <div className="space-y-[13px]">
      <p className="text-prism-meta text-prism-ink-2">
        Apps you allowed to use your Amped.Bio account. Remove an app to end its access.
      </p>
      <ul className="divide-y divide-prism-line">
        {consents.map(consent => {
          const name = consent.clientName || consent.clientId || "Application";
          const host = hostOf(consent.clientUri);
          const scopes = scopesOf(consent).map(scope => describeOAuthScope(scope).title);
          const allowed = allowedOn(consent.createdAt);
          const busy = revoking === consent.id;
          return (
            <li
              key={consent.id}
              className="flex flex-col gap-[13px] py-[13px] sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <AppArt consent={consent} name={name} />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-prism-label font-semibold text-prism-ink [overflow-wrap:anywhere]">
                    {name}
                    {host && (
                      <span className="ml-2 text-prism-meta font-normal text-prism-ink-2">
                        {host}
                      </span>
                    )}
                  </p>
                  {scopes.length > 0 && (
                    <p className="text-prism-meta text-prism-ink-2">Can: {scopes.join(", ")}</p>
                  )}
                  {allowed && <p className="text-prism-meta text-prism-ink-2">Allowed {allowed}</p>}
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => revoke.mutate({ id: consent.id })}
                disabled={busy}
                aria-busy={busy}
                aria-label={`Revoke ${name}`}
                className="max-sm:w-full"
              >
                {busy && (
                  <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />
                )}
                Revoke
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ConnectedAppsRow() {
  const query = useConsents();
  const count = (query.data as unknown as Consent[] | undefined)?.length;
  return (
    <DisclosureRow
      id={CONNECTED_APPS_ROW}
      label="Connected apps"
      value={count === undefined ? "" : countLabel(count)}
    >
      <ConnectedAppsList />
    </DisclosureRow>
  );
}
