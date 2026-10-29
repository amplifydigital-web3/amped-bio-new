import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DM_RULE_LABELS, TELEGRAM_GROUP_STRINGS as G } from "@repo/constants";
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

type Report = RouterOutputs["admin"]["telegram"]["listReports"][number];
type Tab = "reports" | "paused" | "pilot" | "groups" | "health";
type Person = { id: number; name: string; handle: string | null; email: string };

const who = (p: Person) => `${p.name || p.id}${p.handle ? ` (@${p.handle})` : ""}`;
const when = (value: string | Date | null) => (value ? new Date(value).toLocaleString() : "Never");

/** Error card for a failed list query, with a retry (QA-018). */
function LoadError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-red-50 p-3 text-sm text-red-700"
    >
      <span>The {what} did not load. Try again in a moment.</span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/** A reported thread's messages. The server refuses threads nobody reported (spec 3.9). */
function ReportedThread({ report }: { report: Report }) {
  const thread = useQuery(
    trpc.admin.telegram.reportedThread.queryOptions({ threadId: report.thread.id })
  );
  if (thread.isError) {
    return <LoadError what="conversation" onRetry={() => void thread.refetch()} />;
  }
  if (!thread.data) return <p className="text-sm text-gray-500">Loading…</p>;
  return (
    <ol className="max-h-80 space-y-2 overflow-y-auto rounded-md bg-gray-50 p-3 text-sm">
      {thread.data.messages.map(m => (
        <li key={m.id} className={m.id === report.messageId ? "rounded bg-yellow-100 p-1" : ""}>
          <span className="font-semibold">
            {m.sender === "CREATOR" ? who(report.thread.creator) : who(report.thread.fan)}
          </span>{" "}
          <span className="text-gray-500">
            {new Date(m.createdAt).toLocaleString()}, {m.channel.toLowerCase()}
          </span>
          <p className="whitespace-pre-wrap text-gray-800">{m.body}</p>
        </li>
      ))}
    </ol>
  );
}

/**
 * Admin, Telegram (Build Board #2, Screen Review 120, board tg9). Reports with the
 * reported conversation (admins read a thread only after a report), paused fans
 * and creators, the MESSAGING_INVITE_ONLY pilot, connected groups (board tg9: names,
 * counts and rules only, with a logged re-check) and bot health.
 */
export function AdminTelegram() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("reports");
  const [showResolved, setShowResolved] = useState(false);
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [pauseFor, setPauseFor] = useState<{ user: Person; scope: "fan" | "creator" } | null>(null);
  const [reason, setReason] = useState("");
  const [invitee, setInvitee] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reports = useQuery({
    ...trpc.admin.telegram.listReports.queryOptions({ resolved: showResolved }),
    enabled: tab === "reports",
  });
  const paused = useQuery({
    ...trpc.admin.telegram.listPaused.queryOptions(),
    enabled: tab === "paused",
  });
  const invited = useQuery({
    ...trpc.admin.telegram.listInvited.queryOptions(),
    enabled: tab === "pilot",
  });
  const groups = useQuery({
    ...trpc.admin.telegram.listGroups.queryOptions(),
    enabled: tab === "groups",
  });
  const health = useQuery({
    ...trpc.admin.telegram.botHealth.queryOptions(),
    enabled: tab === "health",
    refetchInterval: tab === "health" ? 30_000 : false,
  });

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: trpc.admin.telegram.pathKey() });
  const onError = (e: { message: string }) => setError(e.message);
  const resolve = useMutation({
    ...trpc.admin.telegram.resolveReport.mutationOptions(),
    onSuccess: refresh,
    onError,
  });
  const pause = useMutation({
    ...trpc.admin.telegram.pauseSender.mutationOptions(),
    onSuccess: () => {
      setPauseFor(null);
      setReason("");
      refresh();
    },
    onError,
  });
  const resume = useMutation({
    ...trpc.admin.telegram.resumeSender.mutationOptions(),
    onSuccess: refresh,
    onError,
  });
  const invite = useMutation({
    ...trpc.admin.telegram.invite.mutationOptions(),
    onSuccess: () => {
      setInvitee("");
      refresh();
    },
    onError,
  });
  const recheck = useMutation({
    ...trpc.admin.telegram.recheckGroup.mutationOptions(),
    onSuccess: refresh,
    onError,
  });
  const uninvite = useMutation({
    ...trpc.admin.telegram.uninvite.mutationOptions(),
    onSuccess: refresh,
    onError,
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: "reports", label: "Reports" },
    { id: "paused", label: "Paused senders" },
    { id: "pilot", label: "Pilot creators" },
    { id: "groups", label: G.adminTab },
    { id: "health", label: "Bot health" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {tabs.map(t => (
          <Button
            key={t.id}
            variant={tab === t.id ? "default" : "outline"}
            onClick={() => {
              setError(null);
              setTab(t.id);
            }}
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

      {tab === "reports" && (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={e => setShowResolved(e.target.checked)}
              className="h-4 w-4"
            />
            Show resolved reports
          </label>
          {reports.isError ? (
            <LoadError what="reports" onRetry={() => void reports.refetch()} />
          ) : !reports.data ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : reports.data.length === 0 ? (
            <p className="text-sm text-gray-500">No reports.</p>
          ) : (
            reports.data.map(r => (
              <Card key={r.id}>
                <CardHeader className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-lg">{r.reason}</CardTitle>
                    <Badge variant="outline">{r.thread.status}</Badge>
                    <Badge variant="secondary">Reported by the {r.reporterSide}</Badge>
                    {r.resolvedAt && <Badge variant="outline">Resolved</Badge>}
                  </div>
                  <p className="text-sm text-gray-600">
                    Creator {who(r.thread.creator)}, fan {who(r.thread.fan)}. Reporter{" "}
                    {who(r.reporter)}. {when(r.createdAt)}. {r.thread.reports} reports,{" "}
                    {r.thread.messages} messages in the conversation.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {r.note && <p className="text-sm text-gray-800">Note: {r.note}</p>}
                  {openThread === r.id && <ReportedThread report={r} />}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setOpenThread(openThread === r.id ? null : r.id)}
                    >
                      {openThread === r.id ? "Hide conversation" : "Open conversation"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setPauseFor({ user: r.thread.fan, scope: "fan" })}
                    >
                      Pause fan
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setPauseFor({ user: r.thread.creator, scope: "creator" })}
                    >
                      Pause creator
                    </Button>
                    {!r.resolvedAt && (
                      <Button
                        onClick={() => resolve.mutate({ id: r.id })}
                        disabled={resolve.isPending}
                      >
                        Resolve
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "paused" &&
        (paused.isError ? (
          <LoadError what="paused senders" onRetry={() => void paused.refetch()} />
        ) : !paused.data ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Paused senders</CardTitle>
              <p className="text-sm text-gray-600">
                Fans paused by the block rule resume on their own after 24 hours. Admin pauses and
                creator pauses last until resumed here.
              </p>
            </CardHeader>
            <CardContent>
              {paused.data.fans.length + paused.data.creators.length === 0 ? (
                <p className="text-sm text-gray-500">Nobody is paused.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="py-2">Person</th>
                      <th>Side</th>
                      <th>Since</th>
                      <th>Until</th>
                      <th>Reason</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ...paused.data.fans.map(f => ({ ...f, scope: "fan" as const })),
                      ...paused.data.creators.map(c => ({
                        ...c,
                        pausedUntil: null,
                        scope: "creator" as const,
                      })),
                    ].map(row => (
                      <tr key={`${row.scope}-${row.user.id}`} className="border-t">
                        <td className="py-2">{who(row.user)}</td>
                        <td>{row.scope === "fan" ? "Fan sending" : "Fan messages"}</td>
                        <td>{when(row.pausedAt)}</td>
                        <td>{row.pausedUntil ? when(row.pausedUntil) : "Until resumed"}</td>
                        <td>{row.reason ?? ""}</td>
                        <td className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => resume.mutate({ userId: row.user.id, scope: row.scope })}
                          >
                            Resume
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        ))}

      {tab === "pilot" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pilot creators</CardTitle>
            <p className="text-sm text-gray-600">
              While MESSAGING_INVITE_ONLY is on, only invited creators can turn on Fan messages.
              Ending an invite turns Fan messages off for that creator.
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
            {invited.isError ? (
              <LoadError what="pilot creators" onRetry={() => void invited.refetch()} />
            ) : !invited.data ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : invited.data.length === 0 ? (
              <p className="text-sm text-gray-500">No creators invited yet.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-gray-500">
                  <tr>
                    <th className="py-2">Creator</th>
                    <th>Invited</th>
                    <th>Fan messages</th>
                    <th>Rule</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {invited.data.map(row => (
                    <tr key={row.user.id} className="border-t">
                      <td className="py-2">{who(row.user)}</td>
                      <td>{when(row.invitedAt)}</td>
                      <td>{row.enabled ? "On" : "Off"}</td>
                      <td>{row.ruleKind}</td>
                      <td className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => uninvite.mutate({ userId: row.user.id })}
                        >
                          End invite
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "groups" &&
        (groups.isError ? (
          <LoadError what="groups" onRetry={() => void groups.refetch()} />
        ) : !groups.data ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: G.adminGroupsConnected, value: groups.data.groups.length },
                {
                  label: G.adminMembers,
                  value: groups.data.groups
                    .reduce((sum, g) => sum + g.memberCount, 0)
                    .toLocaleString(),
                },
                {
                  label: G.adminNoRights,
                  value: groups.data.groups.filter(g => !g.botIsAdmin).length,
                },
                { label: G.adminRemovedToday, value: groups.data.removedToday },
              ].map(item => (
                <Card key={item.label}>
                  <CardHeader>
                    <p className="text-sm text-gray-600">{item.label}</p>
                    <CardTitle className="text-2xl tabular-nums">{item.value}</CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>
            {groups.data.groups.length === 0 ? (
              <p className="text-sm text-gray-600">{G.adminEmpty}</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                    <tr>
                      <th className="px-3 py-2">{G.adminColumns.group}</th>
                      <th className="px-3 py-2">{G.adminColumns.creator}</th>
                      <th className="px-3 py-2">{G.adminColumns.rule}</th>
                      <th className="px-3 py-2 text-right">{G.adminColumns.members}</th>
                      <th className="px-3 py-2">{G.adminColumns.lastCheck}</th>
                      <th className="px-3 py-2">{G.adminColumns.bot}</th>
                      <th className="px-3 py-2">{G.adminColumns.action}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.data.groups.map(g => (
                      <tr key={g.id} className="border-t">
                        <td className="px-3 py-2 font-semibold">{g.title}</td>
                        <td className="px-3 py-2">{who(g.creator)}</td>
                        <td className="px-3 py-2">{DM_RULE_LABELS[g.ruleKind]}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {g.memberCount.toLocaleString()}
                        </td>
                        <td className="px-3 py-2">{when(g.lastCheckedAt)}</td>
                        <td className="px-3 py-2">
                          {g.botIsAdmin ? (
                            <Badge variant="secondary">{G.adminBotAdmin}</Badge>
                          ) : (
                            <Badge variant="destructive">{G.rightsMissing}</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => recheck.mutate({ id: g.id })}
                            disabled={recheck.isPending}
                          >
                            {G.adminRecheck}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-sm text-gray-600">{G.adminLine}</p>
          </div>
        ))}

      {tab === "health" &&
        (health.isError ? (
          <LoadError what="bot health" onRetry={() => void health.refetch()} />
        ) : !health.data ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Last update from Telegram", value: when(health.data.lastUpdateAt) },
              { label: "Sends waiting", value: health.data.queueDepth },
              { label: "Failed sends, last 24 hours", value: health.data.failedLastDay },
              { label: "Rate limited, last hour", value: health.data.rateLimitedLastHour },
              { label: "Blocked the bot, last 24 hours", value: health.data.blockedLastDay },
              { label: "Linked accounts", value: health.data.linkedUsers },
            ].map(item => (
              <Card key={item.label}>
                <CardHeader>
                  <p className="text-sm text-gray-600">{item.label}</p>
                  <CardTitle className="text-2xl tabular-nums">{item.value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        ))}

      <Dialog
        open={!!pauseFor}
        onOpenChange={open => {
          if (open) return;
          setPauseFor(null);
          // Closing without pausing (Esc, overlay) must not pre-fill the reason either
          setReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pauseFor?.scope === "creator"
                ? `Pause Fan messages for ${pauseFor ? who(pauseFor.user) : ""}`
                : `Pause sending for ${pauseFor ? who(pauseFor.user) : ""}`}
            </DialogTitle>
            <DialogDescription>
              The pause lasts until an admin resumes it. The reason stays in the admin record.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder="Why this account is paused"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPauseFor(null);
                // A cancelled pause must not pre-fill the reason for the next one
                setReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                pauseFor &&
                pause.mutate({
                  userId: pauseFor.user.id,
                  scope: pauseFor.scope,
                  reason: reason.trim(),
                })
              }
              disabled={reason.trim().length < 3 || pause.isPending}
            >
              Pause
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
