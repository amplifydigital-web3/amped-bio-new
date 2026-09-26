import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  CardContent,
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
  Switch,
  Textarea,
  trpc,
} from "@repo/ui";
import { KeyRound, Plus, ShieldCheck } from "lucide-react";

interface CreatedClient {
  client_id: string;
  client_secret?: string;
}

export function AdminOAuthClients() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [redirectUris, setRedirectUris] = useState("");
  const [skipConsent, setSkipConsent] = useState(false);
  const [enableEndSession, setEnableEndSession] = useState(false);
  const [created, setCreated] = useState<CreatedClient | null>(null);

  const clientsQuery = useQuery(trpc.admin.oauthApps.listClients.queryOptions());
  const resourcesQuery = useQuery(trpc.admin.oauthApps.resources.queryOptions());

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.admin.oauthApps.listClients.queryKey() });
  };

  const createMutation = useMutation({
    ...trpc.admin.oauthApps.createClient.mutationOptions(),
    onSuccess: data => {
      setCreated(data as unknown as CreatedClient);
      setName("");
      setRedirectUris("");
      setSkipConsent(false);
      setEnableEndSession(false);
      setIsCreateOpen(false);
      invalidate();
    },
  });

  const toggleMutation = useMutation({
    ...trpc.admin.oauthApps.setClientDisabled.mutationOptions(),
    onSuccess: invalidate,
  });

  const submit = () => {
    const uris = redirectUris
      .split("\n")
      .map(uri => uri.trim())
      .filter(Boolean);

    if (!name.trim() || uris.length === 0) return;

    createMutation.mutate({
      client_name: name.trim(),
      redirect_uris: uris,
      skip_consent: skipConsent,
      enable_end_session: enableEndSession,
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> OAuth clients
          </CardTitle>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New client
          </Button>
        </CardHeader>
        <CardContent>
          {created?.client_secret ? (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">
                Client secret for {created.client_id}. It is shown only once.
              </p>
              <code className="mt-1 block overflow-x-auto rounded bg-white px-2 py-1 text-xs">
                {created.client_secret}
              </code>
            </div>
          ) : null}

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2">Client</th>
                <th className="py-2">Redirect URIs</th>
                <th className="py-2">Flags</th>
                <th className="py-2 text-right">Enabled</th>
              </tr>
            </thead>
            <tbody>
              {(clientsQuery.data ?? []).map(client => (
                <tr key={client.clientId} className="border-b border-gray-100">
                  <td className="py-3">
                    <p className="font-medium text-gray-900">{client.name ?? client.clientId}</p>
                    <p className="font-mono text-xs text-gray-500">{client.clientId}</p>
                  </td>
                  <td className="py-3 text-xs text-gray-600">
                    {(client.redirectUris ?? []).join(", ") || "-"}
                  </td>
                  <td className="py-3 text-xs">
                    <div className="flex flex-wrap gap-1">
                      {client.skipConsent ? <Badge variant="secondary">skip consent</Badge> : null}
                      {client.enableEndSession ? <Badge variant="secondary">end session</Badge> : null}
                      {client.hasSecret ? <Badge variant="secondary">confidential</Badge> : null}
                    </div>
                  </td>
                  <td className="py-3 text-right">
                    <Switch
                      checked={!client.disabled}
                      onChange={checked =>
                        toggleMutation.mutate({ client_id: client.clientId, disabled: !checked })
                      }
                    />
                  </td>
                </tr>
              ))}
              {clientsQuery.isLoading ? (
                <tr>
                  <td className="py-4 text-sm text-gray-500" colSpan={4}>
                    Loading clients…
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> OAuth resources
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-gray-700">
            {(resourcesQuery.data ?? []).map(resource => (
              <li key={resource.identifier} className="flex items-center justify-between gap-3">
                <span className="truncate">{resource.identifier}</span>
                <span className="flex items-center gap-2 text-xs text-gray-500">
                  {resource.accessTokenTtl ? `${resource.accessTokenTtl}s tokens` : "default ttl"}
                  {resource.disabled ? <Badge variant="secondary">disabled</Badge> : null}
                </span>
              </li>
            ))}
            {(resourcesQuery.data ?? []).length === 0 ? (
              <li className="text-sm text-gray-500">No protected resources registered.</li>
            ) : null}
          </ul>
        </CardContent>
      </Card>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New OAuth client</DialogTitle>
            <DialogDescription>
              Administrative registration, including trusted flags reserved for first-party clients.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-client-name">Name</Label>
              <Input
                id="admin-client-name"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Amped.bio mobile app"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="admin-redirect-uris">Redirect URIs (one per line)</Label>
              <Textarea
                id="admin-redirect-uris"
                rows={3}
                value={redirectUris}
                onChange={event => setRedirectUris(event.target.value)}
                placeholder="https://app.amped.bio/api/auth/callback/amped"
              />
            </div>

            <div className="flex items-center justify-between">
              <Switch
                checked={skipConsent}
                onChange={setSkipConsent}
                label="Skip consent screen (trusted client)"
              />
            </div>

            <div className="flex items-center justify-between">
              <Switch
                checked={enableEndSession}
                onChange={setEnableEndSession}
                label="Allow RP initiated logout"
              />
            </div>

            {createMutation.isError ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {(createMutation.error as { message?: string })?.message ??
                  "Unable to create the OAuth client"}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
