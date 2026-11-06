import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, ErrorCard, trpc } from "@repo/ui";
import { day, useMerchant } from "../merchant";
import { Badge, CodeField, Field, PageTitle, Panel, Table, td, th, tr } from "../parts";

// Boards p5 and p7: API keys, webhook endpoints, the verify link and the delivery log. A key and a
// signing secret are shown once. Owners and Developers only.
const APP = import.meta.env.VITE_PANEL_URL ?? "https://app.amped.bio";
const MODE = import.meta.env.MODE === "production" ? "live" : "test";

export function Developers() {
  const merchant = useMerchant();
  const queryClient = useQueryClient();
  const allowed = merchant.role === "owner" || merchant.role === "developer";
  const view = useQuery({
    ...trpc.merchant.developers.view.queryOptions({ merchantId: merchant.id }),
    enabled: allowed,
  });
  const [code, setCode] = useState("");
  const [keyName, setKeyName] = useState("");
  const [url, setUrl] = useState("");
  const [shown, setShown] = useState<{ label: string; value: string } | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.merchant.developers.view.queryKey({ merchantId: merchant.id }),
    });
  const failed = (error: { message: string }) => toast.error(error.message);

  const createKey = useMutation({
    ...trpc.merchant.developers.createKey.mutationOptions(),
    onSuccess: data => {
      setShown(data ? { label: "Your new API key", value: data.key } : null);
      setKeyName("");
      setCode("");
      void refresh();
    },
    onError: failed,
  });
  const revoke = useMutation({
    ...trpc.merchant.developers.revokeKey.mutationOptions(),
    onSuccess: () => void refresh(),
    onError: failed,
  });
  const addEndpoint = useMutation({
    ...trpc.merchant.developers.addEndpoint.mutationOptions(),
    onSuccess: data => {
      setShown(data ? { label: "Signing secret", value: data.secret } : null);
      setUrl("");
      setCode("");
      void refresh();
    },
    onError: failed,
  });
  const rotate = useMutation({
    ...trpc.merchant.developers.rotateSecret.mutationOptions(),
    onSuccess: data => {
      setShown(data ? { label: "New signing secret", value: data.secret } : null);
      setCode("");
    },
    onError: failed,
  });
  const replay = useMutation({
    ...trpc.merchant.developers.replay.mutationOptions(),
    onSuccess: () => void refresh(),
    onError: failed,
  });
  const test = useMutation({
    ...trpc.merchant.developers.sendTestOrder.mutationOptions(),
    onSuccess: data => {
      toast.success(
        data?.queued
          ? "Test order queued. Watch the delivery log."
          : "Add a webhook endpoint first."
      );
      void refresh();
    },
    onError: failed,
  });

  if (!allowed) return <ErrorCard title="Only an Owner or a Developer can open Developers" />;
  if (view.isError)
    return <ErrorCard title="Developers did not load" onRetry={() => void view.refetch()} />;
  const d = view.data;

  return (
    <>
      <PageTitle>Developers</PageTitle>
      {shown && (
        <div
          role="alert"
          className="rounded-prism-13 bg-prism-warning-bg p-[13px] text-prism-warning-ink"
        >
          <p className="font-semibold">
            {shown.label}. It is shown once. Store it in your secret manager now.
          </p>
          <p className="break-all font-mono text-prism-label">{shown.value}</p>
          <Button
            variant="secondary"
            className="mt-2"
            onClick={() =>
              void navigator.clipboard.writeText(shown.value).then(() => toast.success("Copied"))
            }
          >
            Copy
          </Button>
          <Button variant="ghost" className="ml-2 mt-2" onClick={() => setShown(null)}>
            I stored it
          </Button>
        </div>
      )}
      <CodeField value={code} onChange={setCode} />
      <Panel title="API keys">
        <Table label="API keys">
          <thead>
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Key</th>
              <th className={th}>Mode</th>
              <th className={th}>Last used</th>
              <th className={th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(d?.keys ?? []).map(k => (
              <tr key={k.id} className={tr}>
                <td className={td}>{k.name}</td>
                <td className={`${td} font-mono`}>{k.prefix}...</td>
                <td className={td}>
                  <Badge tone={k.mode === "test" ? "warn" : "ink"}>
                    {k.mode === "test" ? "Test" : "Live"}
                  </Badge>
                </td>
                <td className={td}>{k.revokedAt ? "Revoked" : day(k.lastUsedAt) || "Never"}</td>
                <td className={td}>
                  {!k.revokedAt && (
                    <Button
                      variant="ghost"
                      onClick={() => revoke.mutate({ merchantId: merchant.id, keyId: k.id })}
                    >
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Key name" value={keyName} onChange={setKeyName} />
          <Button
            disabled={!keyName || code.length !== 6 || createKey.isPending}
            onClick={() =>
              createKey.mutate({ merchantId: merchant.id, name: keyName, mode: MODE, code })
            }
          >
            Create key
          </Button>
        </div>
      </Panel>
      <div className="grid gap-[21px] lg:grid-cols-2">
        <Panel title="Webhook endpoints">
          {(d?.endpoints ?? []).map(e => (
            <div key={e.id} className="space-y-1 border-b border-prism-line pb-2">
              <p className="break-all font-mono text-prism-label">{e.url}</p>
              <p className="text-prism-meta text-prism-ink-2">{e.events.join(", ")}</p>
              <div className="flex items-center gap-2">
                <Badge tone={e.status === "active" ? "done" : "ink"}>
                  {e.status === "active" ? "Delivering" : "Off"}
                </Badge>
                <Button
                  variant="ghost"
                  disabled={code.length !== 6}
                  onClick={() => rotate.mutate({ merchantId: merchant.id, endpointId: e.id, code })}
                >
                  Rotate secret
                </Button>
              </div>
            </div>
          ))}
          <Field label="Endpoint URL" value={url} onChange={setUrl} hint="https only" />
          <Button
            variant="secondary"
            disabled={!url || code.length !== 6 || addEndpoint.isPending}
            onClick={() => addEndpoint.mutate({ merchantId: merchant.id, url, code })}
          >
            Add endpoint
          </Button>
        </Panel>
        <Panel title="Verify link">
          <p className="text-prism-body text-prism-ink-2">
            After a buyer pays, Amped.Bio sends them to your Amped.Bio sign in with the order. Look
            the order up before you start the check.
          </p>
          <code className="block break-all rounded-prism-13 bg-white/80 p-[13px] text-prism-meta">
            {"{AUTHBASE}/sso/amped?returnTo=%2Fverify%3Forder%3D{order_ref}"}
          </code>
          <p className="text-prism-label font-semibold">Return to Amped.Bio</p>
          <code className="block break-all rounded-prism-13 bg-white/80 p-[13px] text-prism-meta">
            {`${APP}/wallet?tab=rns&name={rns_name}&view=identity&order={order_ref}`}
          </code>
          <Button
            variant="secondary"
            disabled={test.isPending}
            onClick={() => test.mutate({ merchantId: merchant.id })}
          >
            Send a test order
          </Button>
        </Panel>
      </div>
      <Panel title="Delivery log">
        <Table label="Delivery log">
          <thead>
            <tr>
              <th className={th}>Event</th>
              <th className={th}>Order</th>
              <th className={th}>Attempt</th>
              <th className={th}>Response</th>
              <th className={th}>Next retry</th>
              <th className={th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(d?.deliveries ?? []).map(x => (
              <tr key={x.id} className={tr}>
                <td className={`${td} font-mono`}>{x.type}</td>
                <td className={`${td} font-mono`}>{x.orderRef?.slice(0, 8) ?? ""}</td>
                <td className={td}>{x.attempt}</td>
                <td className={td}>
                  <Badge
                    tone={
                      x.status === "delivered" ? "done" : x.status === "failed" ? "danger" : "warn"
                    }
                  >
                    {x.responseCode ?? x.status}
                  </Badge>
                </td>
                <td className={td}>{x.nextAttemptAt ? day(x.nextAttemptAt) : "None"}</td>
                <td className={td}>
                  <Button
                    variant="ghost"
                    onClick={() => replay.mutate({ merchantId: merchant.id, deliveryId: x.id })}
                  >
                    {x.status === "pending" ? "Replay now" : "Replay"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </>
  );
}
