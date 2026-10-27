import { useMemo, useState } from "react";
import { KeyRound, Plus, SearchX, ShieldCheck } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  Checkbox,
  ChipGroup,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorCard,
  Notice,
  cn,
  trpc,
  trpcClient,
  type RouterOutputs,
} from "@repo/ui";
import { SKIP_CONSENT_HOST_ERROR, canSkipConsent } from "@repo/constants";
import { CopyButton } from "../kit/CopyButton";
import { Eyebrow, SearchWell, retryToast } from "../kit/parts";
import { SlabSkeletonRows, tdClass, thClass } from "../kit/Slab";
import { WordBadge } from "../kit/WordBadge";
import { formatCount, formatDay } from "../kit/format";
import {
  AUTH_METHOD_LABELS,
  ClientForm,
  type AuthMethod,
  type ClientFormValues,
} from "../components/oauth/ClientForm";

// Screen Review 094. OAuth clients as a moderation console on the admin
// shell: search and chips, a G2 slab of clients (rows 44) with a labeled On
// checkbox that applies with Undo, a detail Dialog with Edit, the Create
// Dialog that ends on a Credentials step, and the protected resources slab.
// Client IDs, secrets and URIs use the v1.1 monospace token (D2), always with
// a 44 copy button. Skip consent is limited to Amped.Bio hosts (D1).

type Client = RouterOutputs["admin"]["oauthApps"]["listClients"][number];
type Resource = RouterOutputs["admin"]["oauthApps"]["resources"][number];
type Filter = "all" | "first" | "third" | "off";

interface Created {
  name: string;
  clientId: string;
  secret?: string;
}

const EMPTY_FORM: ClientFormValues = {
  name: "",
  redirectUris: [""],
  applicationType: "web",
  authMethod: "client_secret_basic",
  skipConsent: false,
  endSession: false,
};

const isFirstParty = (client: Client) => canSkipConsent(client.redirectUris ?? []);

function typeLabel(client: Client) {
  if (client.hasSecret)
    return client.applicationType === "native" ? "Native, confidential" : "Web, confidential";
  return client.applicationType === "native" ? "Native, PKCE" : "Public, PKCE";
}

function ownerOf(client: Client) {
  const user = client.user;
  if (!user || user.role?.includes("admin")) return { team: true as const };
  return { team: false as const, name: user.name, handle: user.handle };
}

function Owner({ client }: { client: Client }) {
  const owner = ownerOf(client);
  const label = owner.team ? "Amped.Bio team" : owner.name || owner.handle || "Unknown";
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className="flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-prism-ink shadow-[inset_0_0_0_1px_rgba(22,21,43,0.18)]"
      >
        {label.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-prism-label text-prism-ink">{label}</span>
        {!owner.team && owner.handle && (
          <span className="block text-prism-meta text-prism-ink-2">@{owner.handle}</span>
        )}
      </span>
    </span>
  );
}

function TrustBadges({ client }: { client: Client }) {
  if (!client.skipConsent && !client.enableEndSession) {
    return <span className="text-prism-meta text-prism-ink-2">None</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {client.skipConsent && <WordBadge tone="warning">Skips consent</WordBadge>}
      {client.enableEndSession && <WordBadge tone="neutral">Can end sessions</WordBadge>}
    </span>
  );
}

/** Plain causes by error code (094 I10, row 083 I13). Never the raw message. */
function causeOf(error: unknown): string {
  const data = (error as { data?: { code?: string } })?.data;
  const message = (error as { message?: string })?.message;
  if (message === SKIP_CONSENT_HOST_ERROR) return SKIP_CONSENT_HOST_ERROR;
  switch (data?.code) {
    case "UNAUTHORIZED":
    case "FORBIDDEN":
      return "Your session ended. Sign in again, then retry.";
    case "NOT_FOUND":
      return "This client no longer exists. Refresh the list.";
    case "CONFLICT":
      return "A client with these details already exists.";
    case "BAD_REQUEST":
      return "The server did not accept these details. Check the redirect URIs and try again.";
    default:
      return "The server did not answer. Check your connection, then try again.";
  }
}

function resourceScopes(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === "string");
  } catch {
    // space or comma separated
  }
  return value.split(/[\s,]+/).filter(Boolean);
}

function lifetime(seconds: number | null | undefined) {
  if (!seconds) return "Default token lifetime";
  const minutes = Math.round(seconds / 60);
  return `Tokens last ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

export function AdminOAuthClients() {
  const queryClient = useQueryClient();
  const clients = useQuery(trpc.admin.oauthApps.listClients.queryOptions());
  const resources = useQuery(trpc.admin.oauthApps.resources.queryOptions());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [disabledOverride, setDisabledOverride] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Client | null>(null);
  const [form, setForm] = useState<{ mode: "create" | "edit"; client?: Client } | null>(null);
  const [formError, setFormError] = useState<string | undefined>();
  const [created, setCreated] = useState<Created | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.admin.oauthApps.listClients.queryKey() });

  const all = useMemo(() => clients.data ?? [], [clients.data]);
  const isOff = (client: Client) => disabledOverride[client.clientId] ?? !!client.disabled;
  const counts = useMemo(
    () => ({
      all: all.length,
      first: all.filter(isFirstParty).length,
      third: all.filter(c => !isFirstParty(c)).length,
      off: all.filter(c => !!c.disabled).length,
    }),
    [all]
  );
  const view = all.filter(client => {
    if (filter === "first" && !isFirstParty(client)) return false;
    if (filter === "third" && isFirstParty(client)) return false;
    if (filter === "off" && !isOff(client)) return false;
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [client.name, client.clientId, client.user?.name, client.user?.handle].some(value =>
      value?.toLowerCase().includes(term)
    );
  });

  const setDisabled = async (client: Client, disabled: boolean, fromUndo = false) => {
    setDisabledOverride(o => ({ ...o, [client.clientId]: disabled }));
    setBusyId(client.clientId);
    try {
      await trpcClient.admin.oauthApps.setClientDisabled.mutate({
        client_id: client.clientId,
        disabled,
      });
      if (!fromUndo) {
        toast.success(disabled ? "Client turned off" : "Client turned on", {
          duration: 8000,
          action: { label: "Undo", onClick: () => void setDisabled(client, !disabled, true) },
        });
      }
      await invalidate();
      setDisabledOverride(o => {
        const next = { ...o };
        delete next[client.clientId];
        return next;
      });
    } catch {
      setDisabledOverride(o => ({ ...o, [client.clientId]: !disabled }));
      retryToast("Client did not update", () => void setDisabled(client, disabled, fromUndo));
    } finally {
      setBusyId(null);
    }
  };

  const createClient = useMutation({
    ...trpc.admin.oauthApps.createClient.mutationOptions(),
    onError: error => setFormError(causeOf(error)),
  });
  const updateClient = useMutation({
    ...trpc.admin.oauthApps.updateClient.mutationOptions(),
    onError: error => setFormError(causeOf(error)),
  });

  const submitForm = (values: ClientFormValues) => {
    setFormError(undefined);
    if (form?.mode === "edit" && form.client) {
      updateClient.mutate(
        {
          client_id: form.client.clientId,
          update: {
            client_name: values.name,
            redirect_uris: values.redirectUris,
            application_type: values.applicationType,
            skip_consent: values.skipConsent,
            enable_end_session: values.endSession,
          },
        },
        {
          onSuccess: () => {
            toast.success("Client updated");
            setForm(null);
            setDetail(null);
            void invalidate();
          },
        }
      );
      return;
    }
    createClient.mutate(
      {
        client_name: values.name,
        redirect_uris: values.redirectUris,
        application_type: values.applicationType,
        token_endpoint_auth_method: values.authMethod,
        skip_consent: values.skipConsent,
        enable_end_session: values.endSession,
      },
      {
        onSuccess: data => {
          const result = data as unknown as { client_id: string; client_secret?: string };
          setForm(null);
          setCreated({
            name: values.name,
            clientId: result.client_id,
            secret: result.client_secret,
          });
          void invalidate();
        },
      }
    );
  };

  const formInitial = useMemo<ClientFormValues>(() => {
    const client = form?.client;
    if (!client) return EMPTY_FORM;
    return {
      name: client.name ?? "",
      redirectUris: client.redirectUris?.length ? client.redirectUris : [""],
      applicationType: client.applicationType === "native" ? "native" : "web",
      authMethod: (client.tokenEndpointAuthMethod as AuthMethod) ?? "client_secret_basic",
      skipConsent: !!client.skipConsent,
      endSession: !!client.enableEndSession,
    };
  }, [form]);

  const openCreate = () => {
    setFormError(undefined);
    setForm({ mode: "create" });
  };

  const statusBox = (client: Client, className?: string) => (
    <Checkbox
      checked={!isOff(client)}
      disabled={busyId === client.clientId}
      onCheckedChange={checked => void setDisabled(client, !checked)}
      ariaLabel={`${client.name ?? client.clientId} on`}
      className={className}
    >
      <span className="text-prism-label font-medium">On</span>
    </Checkbox>
  );

  const clientsBody = clients.isError ? (
    <ErrorCard
      title="Clients did not load"
      cause="The server did not answer. Check your connection, then try again."
      retryLabel="Retry"
      onRetry={() => void clients.refetch()}
    />
  ) : !clients.isPending && all.length === 0 ? (
    <div className="prism-slab">
      <EmptyState
        icon={KeyRound}
        title="No OAuth clients yet"
        description="Create a client to let an app use Sign in with Amped.Bio."
        action={
          <Button variant="secondary" onClick={openCreate}>
            New client
          </Button>
        }
      />
    </div>
  ) : !clients.isPending && view.length === 0 ? (
    <div className="prism-slab">
      <EmptyState
        icon={SearchX}
        title={search.trim() ? `No clients match ${search.trim()}` : "No clients in this group"}
        action={
          <Button
            variant="ghost"
            onClick={() => {
              setSearch("");
              setFilter("all");
            }}
          >
            Clear search
          </Button>
        }
      />
    </div>
  ) : (
    <>
      {/* Desktop table (094 I02) */}
      <div className="prism-slab hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table aria-label="OAuth clients" className="w-full min-w-[960px] text-left">
            <thead>
              <tr>
                {["Client", "Owner", "Type", "Trust", "Created", "Status"].map(label => (
                  <th key={label} scope="col" className={thClass}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            {clients.isPending ? (
              <SlabSkeletonRows columns={6} height="h-touch" />
            ) : (
              <tbody>
                {view.map(client => (
                  <tr
                    key={client.clientId}
                    onClick={() => setDetail(client)}
                    aria-busy={busyId === client.clientId || undefined}
                    className="min-h-touch cursor-pointer border-t border-prism-line hover:bg-prism-nav-tint"
                  >
                    <td className={cn(tdClass, "py-1")}>
                      <button
                        type="button"
                        onClick={event => {
                          event.stopPropagation();
                          setDetail(client);
                        }}
                        className="prism-focus rounded-prism-8 text-left text-prism-label font-semibold text-prism-ink"
                      >
                        {client.name ?? "Untitled client"}
                      </button>
                      <span
                        className="flex items-center gap-1"
                        onClick={event => event.stopPropagation()}
                      >
                        <span className="font-prism-mono text-prism-code-sm text-prism-ink-2">
                          {client.clientId}
                        </span>
                        <CopyButton
                          value={client.clientId}
                          label={`Copy client ID of ${client.name ?? "client"}`}
                          size="inline"
                        />
                      </span>
                    </td>
                    <td className={tdClass}>
                      <Owner client={client} />
                    </td>
                    <td
                      className={cn(tdClass, "whitespace-nowrap text-prism-label text-prism-ink")}
                    >
                      {typeLabel(client)}
                    </td>
                    <td className={tdClass}>
                      <TrustBadges client={client} />
                    </td>
                    <td
                      className={cn(
                        tdClass,
                        "whitespace-nowrap text-prism-meta tabular-nums text-prism-ink"
                      )}
                    >
                      {formatDay(client.createdAt)}
                    </td>
                    <td className={tdClass} onClick={event => event.stopPropagation()}>
                      {statusBox(client)}
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
      </div>
      {/* 390: stacked rows 55 with the status box at the right (094 I13) */}
      <ul aria-label="OAuth clients" className="prism-slab divide-y divide-prism-line md:hidden">
        {clients.isPending
          ? Array.from({ length: 5 }).map((_, index) => (
              <li key={index} aria-hidden className="h-14" />
            ))
          : view.map(client => (
              <li key={client.clientId} className="flex min-h-14 items-center gap-3 px-4 py-1">
                <button
                  type="button"
                  onClick={() => setDetail(client)}
                  className="prism-focus min-w-0 flex-1 rounded-prism-8 text-left"
                >
                  <span className="block truncate text-prism-label font-semibold text-prism-ink">
                    {client.name ?? "Untitled client"}
                  </span>
                  <span className="block truncate text-prism-meta text-prism-ink-2">
                    {ownerOf(client).team
                      ? "Amped.Bio team"
                      : client.user?.name || client.user?.handle}
                  </span>
                </button>
                {statusBox(client, "shrink-0")}
              </li>
            ))}
      </ul>
    </>
  );

  const detailRows = (client: Client): [string, React.ReactNode][] => [
    [
      "Client ID",
      <span key="id" className="flex items-center gap-1">
        <span className="break-all font-prism-mono text-prism-code-sm">{client.clientId}</span>
        <CopyButton value={client.clientId} label="Copy client ID" size="inline" />
      </span>,
    ],
    ["Owner", <Owner key="owner" client={client} />],
    ["Type", typeLabel(client)],
    [
      "Client authentication",
      AUTH_METHOD_LABELS[client.tokenEndpointAuthMethod as AuthMethod] ??
        client.tokenEndpointAuthMethod ??
        "Not set",
    ],
    ["Created", formatDay(client.createdAt)],
    ...(client.redirectUris ?? []).map(
      (uri, index) =>
        [
          index === 0 ? "Redirect URIs" : "",
          <span key={uri} className="break-all font-prism-mono text-prism-code-sm">
            {uri}
          </span>,
        ] as [string, React.ReactNode]
    ),
    ["Skips consent", client.skipConsent ? "Yes" : "No"],
    ["Can end sessions", client.enableEndSession ? "Yes" : "No"],
  ];

  return (
    <div className="space-y-8 font-prism">
      <div className="space-y-[13px]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <SearchWell
            label="Search clients"
            hideLabel
            placeholder="Search clients"
            value={search}
            onChange={setSearch}
            className="md:w-[377px]"
          />
          <ChipGroup
            label="Client group"
            value={filter}
            onChange={setFilter}
            className="flex-nowrap overflow-x-auto py-1 md:flex-wrap"
            options={[
              {
                value: "all",
                label: (
                  <>
                    All <span className="tabular-nums">{formatCount(counts.all)}</span>
                  </>
                ),
              },
              {
                value: "first",
                label: (
                  <>
                    First party <span className="tabular-nums">{formatCount(counts.first)}</span>
                  </>
                ),
              },
              {
                value: "third",
                label: (
                  <>
                    Third party <span className="tabular-nums">{formatCount(counts.third)}</span>
                  </>
                ),
              },
              {
                value: "off",
                label: (
                  <>
                    Turned off <span className="tabular-nums">{formatCount(counts.off)}</span>
                  </>
                ),
              },
            ]}
          />
          <Button variant="secondary" className="w-full md:ml-auto md:w-auto" onClick={openCreate}>
            <Plus aria-hidden />
            New client
          </Button>
        </div>
        {clientsBody}
      </div>

      <section aria-labelledby="oauth-resources" className="space-y-[13px]">
        <Eyebrow id="oauth-resources">Protected resources</Eyebrow>
        {resources.isError ? (
          <ErrorCard
            title="Resources did not load"
            cause="The server did not answer. Check your connection, then try again."
            retryLabel="Retry"
            onRetry={() => void resources.refetch()}
          />
        ) : !resources.isPending && (resources.data ?? []).length === 0 ? (
          <div className="prism-slab">
            <EmptyState icon={ShieldCheck} title="No protected resources yet" />
          </div>
        ) : (
          <div className="prism-slab overflow-hidden">
            <table aria-label="Protected resources" className="w-full text-left">
              {resources.isPending ? (
                <SlabSkeletonRows rows={3} columns={3} height="h-touch" />
              ) : (
                <tbody>
                  {(resources.data ?? []).map((resource: Resource, index) => (
                    <tr
                      key={resource.identifier}
                      className={cn("min-h-touch", index > 0 && "border-t border-prism-line")}
                    >
                      <td className={cn(tdClass, "py-2")}>
                        <span className="block text-prism-label font-semibold text-prism-ink">
                          {resource.name}
                        </span>
                        <span className="block break-all font-prism-mono text-prism-code-sm text-prism-ink-2">
                          {resource.identifier}
                        </span>
                      </td>
                      <td className={cn(tdClass, "py-2")}>
                        <span className="flex flex-wrap gap-1">
                          {resourceScopes(resource.allowedScopes).map(scope => (
                            <WordBadge key={scope} tone="neutral">
                              {scope}
                            </WordBadge>
                          ))}
                          {resource.disabled && <WordBadge tone="warning">Off</WordBadge>}
                        </span>
                      </td>
                      <td
                        className={cn(
                          tdClass,
                          "whitespace-nowrap py-2 text-prism-meta text-prism-ink"
                        )}
                      >
                        {lifetime(resource.accessTokenTtl)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        )}
      </section>

      {/* Detail (094 I04) */}
      <Dialog open={!!detail && !form} onOpenChange={open => !open && setDetail(null)}>
        <DialogContent>
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.name ?? "Untitled client"}</DialogTitle>
              </DialogHeader>
              <dl className="prism-slab divide-y divide-prism-line">
                {detailRows(detail).map(([label, value], index) => (
                  <div
                    key={`${label}-${index}`}
                    className="grid min-h-touch grid-cols-[144px_1fr] items-center gap-3 px-4 py-2"
                  >
                    <dt className="text-prism-meta text-prism-ink-2">{label}</dt>
                    <dd className="min-w-0 text-prism-label text-prism-ink">{value}</dd>
                  </div>
                ))}
              </dl>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setDetail(null)}>
                  Close
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFormError(undefined);
                    setForm({ mode: "edit", client: detail });
                  }}
                >
                  Edit
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create and Edit (094 I05, I06, I10, I14) */}
      <Dialog
        open={!!form}
        onOpenChange={open =>
          !open && !createClient.isPending && !updateClient.isPending && setForm(null)
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form?.mode === "edit" ? `Edit ${form.client?.name ?? "client"}` : "New client"}
            </DialogTitle>
          </DialogHeader>
          {form && (
            <ClientForm
              mode={form.mode}
              initial={formInitial}
              busy={createClient.isPending || updateClient.isPending}
              serverError={formError}
              onCancel={() => setForm(null)}
              onSubmit={submitForm}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Credentials (094 I07): the secret shows once, here only */}
      <Dialog open={!!created} onOpenChange={open => !open && setCreated(null)}>
        <DialogContent>
          {created && (
            <>
              <DialogHeader>
                <DialogTitle>Client created</DialogTitle>
                <DialogDescription>
                  {created.name} can now use Sign in with Amped.Bio.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <p className="text-prism-label font-semibold text-prism-ink">Client ID</p>
                <div className="flex items-center gap-2">
                  <div className="prism-well flex h-touch min-w-0 flex-1 items-center overflow-x-auto px-3 font-prism-mono text-prism-code text-prism-ink">
                    {created.clientId}
                  </div>
                  <CopyButton value={created.clientId} label="Copy client ID" />
                </div>
              </div>
              {created.secret && (
                <Notice variant="warning" title="Copy this secret now">
                  <p>It is shown once. Store it before you leave this page.</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="prism-well flex h-touch min-w-0 flex-1 items-center overflow-x-auto bg-white px-3 font-prism-mono text-prism-code-sm text-prism-ink">
                      {created.secret}
                    </div>
                    <CopyButton value={created.secret} label="Copy client secret" />
                  </div>
                </Notice>
              )}
              <DialogFooter>
                <Button size="lg" onClick={() => setCreated(null)}>
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
