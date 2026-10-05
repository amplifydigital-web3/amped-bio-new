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
  Textarea,
  trpc,
  type RouterOutputs,
} from "@repo/ui";
import { BROADCAST_FOOTER } from "@repo/constants";

type Item = RouterOutputs["admin"]["broadcasts"]["reviewQueue"][number];
type Tab = "review" | "flagged" | "reported" | "senders";

function BroadcastCard({
  item,
  actions,
  extra,
}: {
  item: Item;
  actions?: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const flags = item.flags;
  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-lg">{item.title}</CardTitle>
          <Badge variant="outline">{item.status}</Badge>
          {item.reviewReason === "first_send" && <Badge variant="secondary">First broadcast</Badge>}
          {flags.length > 0 && <Badge variant="destructive">Flagged: {flags.join(", ")}</Badge>}
        </div>
        <p className="text-sm text-gray-600">
          {item.creator.name} (@{item.creator.handle ?? "no handle"}, {item.creator.email}), pool{" "}
          {item.pool?.name ?? item.pool?.id ?? "none"}. {new Date(item.createdAt).toLocaleString()}.{" "}
          {item.status === "SENT"
            ? `${item.recipientCount} recipients`
            : `about ${item.recipientEstimate} members`}
          .{item._count.reports > 0 && ` ${item._count.reports} reports.`}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm text-gray-800">
          {item.body}
        </p>
        <p className="text-xs text-gray-500">{BROADCAST_FOOTER(item.creator.name)}</p>
        {item.reviewNote && <p className="text-sm text-red-700">Review note: {item.reviewNote}</p>}
        {extra}
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </CardContent>
    </Card>
  );
}

/**
 * Creator Pool Broadcast admin (Build Board #1): first-send review, flagged
 * sends (warn only, so these already reached members), reports, and the
 * invite-only pilot.
 */
export function AdminBroadcasts() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("review");
  const [noteFor, setNoteFor] = useState<{ id: number; action: "reject" | "remove" } | null>(null);
  const [note, setNote] = useState("");
  const [invitee, setInvitee] = useState("");
  const [error, setError] = useState<string | null>(null);

  const review = useQuery({
    ...trpc.admin.broadcasts.reviewQueue.queryOptions(),
    enabled: tab === "review",
  });
  const flagged = useQuery({
    ...trpc.admin.broadcasts.flagged.queryOptions(),
    enabled: tab === "flagged",
  });
  const reported = useQuery({
    ...trpc.admin.broadcasts.reported.queryOptions(),
    enabled: tab === "reported",
  });
  const senders = useQuery({
    ...trpc.admin.broadcasts.senders.queryOptions(),
    enabled: tab === "senders",
  });

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: trpc.admin.broadcasts.pathKey() });
  const onError = (e: { message: string }) => setError(e.message);
  const approve = useMutation({
    ...trpc.admin.broadcasts.approve.mutationOptions(),
    onSuccess: refresh,
    onError,
  });
  const reject = useMutation({
    ...trpc.admin.broadcasts.reject.mutationOptions(),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({
    ...trpc.admin.broadcasts.remove.mutationOptions(),
    onSuccess: refresh,
    onError,
  });
  const invite = useMutation({
    ...trpc.admin.broadcasts.invite.mutationOptions(),
    onSuccess: () => {
      setInvitee("");
      refresh();
    },
    onError,
  });
  const revoke = useMutation({
    ...trpc.admin.broadcasts.revokeInvite.mutationOptions(),
    onSuccess: refresh,
    onError,
  });
  const resume = useMutation({
    ...trpc.admin.broadcasts.resume.mutationOptions(),
    onSuccess: refresh,
    onError,
  });
  const pause = useMutation({
    ...trpc.admin.broadcasts.pause.mutationOptions(),
    onSuccess: refresh,
    onError,
  });

  const submitNote = () => {
    if (!noteFor || !note.trim()) return;
    const input = { id: noteFor.id, note: note.trim() };
    if (noteFor.action === "reject") reject.mutate(input);
    else remove.mutate(input);
    setNoteFor(null);
    setNote("");
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "review", label: "Review queue" },
    { id: "flagged", label: "Flagged sends" },
    { id: "reported", label: "Reports" },
    { id: "senders", label: "Pilot senders" },
  ];

  const list = (
    items: Item[] | undefined,
    empty: string,
    actions: (i: Item) => React.ReactNode,
    extra?: (i: Item) => React.ReactNode
  ) =>
    !items ? (
      <p className="text-sm text-gray-500">Loading…</p>
    ) : items.length === 0 ? (
      <p className="text-sm text-gray-500">{empty}</p>
    ) : (
      <div className="space-y-4">
        {items.map(i => (
          <BroadcastCard key={i.id} item={i} actions={actions(i)} extra={extra?.(i)} />
        ))}
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {tabs.map(t => (
          <Button
            key={t.id}
            variant={tab === t.id ? "default" : "outline"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {tab === "review" &&
        list(review.data, "No broadcasts waiting for review.", i => (
          <>
            <Button onClick={() => approve.mutate({ id: i.id })} disabled={approve.isPending}>
              Approve and send
            </Button>
            <Button variant="outline" onClick={() => setNoteFor({ id: i.id, action: "reject" })}>
              Reject
            </Button>
          </>
        ))}

      {tab === "flagged" &&
        list(flagged.data, "No flagged broadcasts.", i =>
          i.status === "SENT" || i.status === "SENDING" ? (
            <Button variant="outline" onClick={() => setNoteFor({ id: i.id, action: "remove" })}>
              Remove from inboxes
            </Button>
          ) : null
        )}

      {tab === "reported" &&
        list(
          reported.data as Item[] | undefined,
          "No reports.",
          i => (
            <>
              {(i.status === "SENT" || i.status === "SENDING") && (
                <Button
                  variant="outline"
                  onClick={() => setNoteFor({ id: i.id, action: "remove" })}
                >
                  Remove from inboxes
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() =>
                  pause.mutate({
                    userId: i.creator.id,
                    reason: `Paused by admin after reports on broadcast ${i.id}`,
                  })
                }
              >
                Pause sender
              </Button>
            </>
          ),
          i => {
            const reports =
              (i as Item & { reports?: { reason: string; note: string | null }[] }).reports ?? [];
            return (
              <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
                {reports.map((r, k) => (
                  <li key={k}>
                    {r.reason}
                    {r.note ? `: ${r.note}` : ""}
                  </li>
                ))}
              </ul>
            );
          }
        )}

      {tab === "senders" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pilot senders</CardTitle>
            <p className="text-sm text-gray-600">
              While BROADCAST_INVITE_ONLY is on, only invited pool owners can send. The invitation
              must state the FTC disclosure rule for any post about early access.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="flex gap-2"
              onSubmit={e => {
                e.preventDefault();
                if (invitee.trim()) invite.mutate({ who: invitee.trim() });
              }}
            >
              <Input
                value={invitee}
                onChange={e => setInvitee(e.target.value)}
                placeholder="@handle or email"
              />
              <Button type="submit" disabled={invite.isPending}>
                Invite
              </Button>
            </form>
            {!senders.data ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-gray-500">
                  <tr>
                    <th className="py-2">Sender</th>
                    <th>Invited</th>
                    <th>First approved</th>
                    <th>Paused</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {senders.data.map(s => (
                    <tr key={s.userId} className="border-t">
                      <td className="py-2">
                        {s.user?.name ?? s.userId} {s.user?.handle ? `(@${s.user.handle})` : ""}
                      </td>
                      <td>{s.invitedAt ? new Date(s.invitedAt).toLocaleDateString() : "No"}</td>
                      <td>
                        {s.firstApprovedAt
                          ? new Date(s.firstApprovedAt).toLocaleDateString()
                          : "No"}
                      </td>
                      <td>{s.pausedAt ? `Yes: ${s.pausedReason ?? ""}` : "No"}</td>
                      <td className="space-x-2 text-right">
                        {s.pausedAt && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => resume.mutate({ userId: s.userId })}
                          >
                            Resume
                          </Button>
                        )}
                        {s.invitedAt && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => revoke.mutate({ userId: s.userId })}
                          >
                            Revoke invite
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!noteFor} onOpenChange={open => !open && setNoteFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {noteFor?.action === "reject" ? "Reject broadcast" : "Remove from inboxes"}
            </DialogTitle>
            <DialogDescription>The creator sees this note on the broadcast.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={4}
            placeholder="Which part breaks the broadcast policy"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteFor(null)}>
              Cancel
            </Button>
            <Button onClick={submitNote} disabled={!note.trim()}>
              {noteFor?.action === "reject" ? "Reject" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
