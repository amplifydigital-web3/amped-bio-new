import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Check, Copy, KeyRound, Plus, ShieldCheck, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  trpc,
} from "@repo/ui";
import { SCOPE_LABELS, parseRedirectUris, type OAuthClientSummary } from "./developer-types";

interface ClientFormState {
  client_name: string;
  client_uri: string;
  redirectUris: string;
  application_type: "web" | "native";
  token_endpoint_auth_method: "none" | "client_secret_basic" | "client_secret_post";
}

const emptyForm: ClientFormState = {
  client_name: "",
  client_uri: "",
  redirectUris: "",
  application_type: "web",
  token_endpoint_auth_method: "client_secret_basic",
};

export function DeveloperPanel() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState<ClientFormState>(emptyForm);
  const [issuedSecret, setIssuedSecret] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  const clientsQuery = useQuery(trpc.oauthApps.list.queryOptions());
  const consentsQuery = useQuery(trpc.oauthApps.consents.queryOptions());

  const clients = (clientsQuery.data ?? []) as unknown as Array<
    OAuthClientSummary & { client_id: string; client_name?: string; redirect_uris?: string[] }
  >;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.oauthApps.list.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.oauthApps.consents.queryKey() });
  };

  const createMutation = useMutation({
    ...trpc.oauthApps.create.mutationOptions(),
    onSuccess: data => {
      const secret = (data as unknown as { client_secret?: string })?.client_secret;
      setIssuedSecret(secret ?? null);
      setForm(emptyForm);
      setIsCreateOpen(false);
      toast.success("Application created");
      invalidate();
    },
    onError: error => toast.error((error as { message?: string })?.message || "Unable to create application"),
  });

  const rotateMutation = useMutation({
    ...trpc.oauthApps.rotateSecret.mutationOptions(),
    onSuccess: data => {
      const secret = (data as unknown as { client_secret?: string })?.client_secret;
      setIssuedSecret(secret ?? null);
      toast.success("Client secret rotated. Copy it now: it is shown once.");
      invalidate();
    },
    onError: error => toast.error((error as { message?: string })?.message || "Unable to rotate secret"),
  });

  const deleteMutation = useMutation({
    ...trpc.oauthApps.remove.mutationOptions(),
    onSuccess: () => {
      toast.success("Application removed");
      invalidate();
    },
    onError: error => toast.error((error as { message?: string })?.message || "Unable to remove application"),
  });

  const revokeMutation = useMutation({
    ...trpc.oauthApps.revokeConsent.mutationOptions(),
    onSuccess: () => {
      toast.success("Access revoked");
      invalidate();
    },
    onError: error => toast.error((error as { message?: string })?.message || "Unable to revoke access"),
  });

  const redirectUris = useMemo(
    () =>
      form.redirectUris
        .split("\n")
        .map(uri => uri.trim())
        .filter(Boolean),
    [form.redirectUris]
  );

  const submit = () => {
    if (!form.client_name.trim()) {
      toast.error("Give the application a name");
      return;
    }

    if (redirectUris.length === 0) {
      toast.error("Add at least one redirect URI");
      return;
    }

    createMutation.mutate({
      client_name: form.client_name.trim(),
      client_uri: form.client_uri.trim() || undefined,
      redirect_uris: redirectUris,
      application_type: form.application_type,
      token_endpoint_auth_method: form.token_endpoint_auth_method,
    });
  };

  const copySecret = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyingId(value);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="space-y-6 p-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <KeyRound className="h-5 w-5 text-blue-600" /> OAuth applications
            </CardTitle>
            <CardDescription>
              Build &quot;Sign in with Amped.bio&quot; into your app. Credentials are shown once, so store them
              safely.
            </CardDescription>
          </div>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New application
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {issuedSecret ? (
            <div className="rounded-md border border-green-200 bg-green-50 p-3">
              <p className="text-sm font-medium text-green-900">
                Copy your client secret now. It will not be shown again.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded bg-white px-2 py-1 text-xs text-gray-800">
                  {issuedSecret}
                </code>
                <Button size="sm" variant="outline" onClick={() => void copySecret(issuedSecret)}>
                  {copyingId === issuedSecret ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIssuedSecret(null)}>
                  Done
                </Button>
              </div>
            </div>
          ) : null}

          {clientsQuery.isLoading ? (
            <p className="text-sm text-gray-500">Loading applications…</p>
          ) : clients.length === 0 ? (
            <p className="text-sm text-gray-500">
              You have no OAuth applications yet. Create one to let users sign in with their Amped.bio account.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {clients.map(client => {
                const uris = client.redirect_uris ?? parseRedirectUris(client.redirectUris ?? null);
                return (
                  <li key={client.client_id} className="flex flex-col gap-2 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {client.client_name || client.name || client.client_id}
                        </p>
                        <p className="truncate font-mono text-xs text-gray-500">{client.client_id}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {client.disabled ? <Badge variant="secondary">Disabled</Badge> : null}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => rotateMutation.mutate({ client_id: client.client_id })}
                          disabled={rotateMutation.isPending}
                        >
                          Rotate secret
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteMutation.mutate({ client_id: client.client_id })}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {uris.length > 0 ? (
                      <p className="text-xs text-gray-500">Redirect URIs: {uris.join(", ")}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-blue-600" /> Authorized applications
          </CardTitle>
          <CardDescription>Applications that currently have access to your account.</CardDescription>
        </CardHeader>
        <CardContent>
          {consentsQuery.isLoading ? (
            <p className="text-sm text-gray-500">Loading authorized applications…</p>
          ) : (consentsQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-gray-500">No application has access to your account.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {(consentsQuery.data as unknown as Array<Record<string, unknown>>).map(consent => {
                const scopes = String(consent.scopes ?? "").split(/[\s,]+/).filter(Boolean);
                return (
                  <li key={String(consent.id)} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {String(consent.clientId ?? "Application")}
                      </p>
                      <p className="text-xs text-gray-500">
                        {scopes.map(scope => SCOPE_LABELS[scope] ?? scope).join(", ")}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => revokeMutation.mutate({ id: String(consent.id) })}
                      disabled={revokeMutation.isPending}
                    >
                      Revoke
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New OAuth application</DialogTitle>
            <DialogDescription>
              Register the app that will use &quot;Sign in with Amped.bio&quot;.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="client-name">Application name</Label>
              <Input
                id="client-name"
                value={form.client_name}
                onChange={event => setForm(prev => ({ ...prev, client_name: event.target.value }))}
                placeholder="My awesome app"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="client-uri">Website (optional)</Label>
              <Input
                id="client-uri"
                value={form.client_uri}
                onChange={event => setForm(prev => ({ ...prev, client_uri: event.target.value }))}
                placeholder="https://example.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="redirect-uris">Redirect URIs (one per line)</Label>
              <Textarea
                id="redirect-uris"
                rows={3}
                value={form.redirectUris}
                onChange={event => setForm(prev => ({ ...prev, redirectUris: event.target.value }))}
                placeholder={"https://example.com/api/auth/callback/amped\nhttp://localhost:3000/api/auth/callback/amped"}
              />
              <p className="text-xs text-gray-500">
                Web applications require HTTPS. Use the native type to allow http://localhost during development.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Application type</Label>
                <Select
                  value={form.application_type}
                  onValueChange={value =>
                    setForm(prev => ({ ...prev, application_type: value as ClientFormState["application_type"] }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="web">Web</SelectItem>
                    <SelectItem value="native">Native</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Client authentication</Label>
                <Select
                  value={form.token_endpoint_auth_method}
                  onValueChange={value =>
                    setForm(prev => ({
                      ...prev,
                      token_endpoint_auth_method: value as ClientFormState["token_endpoint_auth_method"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client_secret_basic">Client secret (basic)</SelectItem>
                    <SelectItem value="client_secret_post">Client secret (post)</SelectItem>
                    <SelectItem value="none">Public client (PKCE only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create application"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
