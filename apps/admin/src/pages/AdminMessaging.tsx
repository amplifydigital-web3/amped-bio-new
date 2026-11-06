import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MESSAGE_REPORT_REASONS, MESSAGE_UI } from "@repo/constants";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorCard,
  MessageBubble,
  Notice,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  CountBadge,
  cn,
  trpc,
  type RouterOutputs,
} from "@repo/ui";
import { toast } from "sonner";
import {
  SlabMessageRow,
  SlabSkeletonRows,
  SlabTable,
  rowClass,
  stickyCell,
  tdClass,
  thClass,
} from "../kit/Slab";
import { WordBadge } from "../kit/WordBadge";
import { formatCount, formatDayTime, publicPageUrl } from "../kit/format";

type Report = RouterOutputs["admin"]["messaging"]["listReports"][number];
type Person = { id: number; name: string; handle: string | null };
type Tab = "reports" | "paused" | "caps" | "flagged" | "log";

const REASON = Object.fromEntries(MESSAGE_REPORT_REASONS.map(r => [r.value, r.label])) as Record<
  string,
  string
>;
const who = (p: Person | null) => (p ? (p.handle ? `@${p.handle}` : p.name) : "Deleted account");

function age(value: string | Date) {
  const ms = Date.now() - new Date(value).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))} min`;
  if (h < 24) return `${h} hr`;
  const d = Math.floor(h / 24);
  return d === 1 ? "1 day" : `${d} days`;
}

const STATUS: Record<Report["status"], { tone: "warning" | "danger" | "success"; label: string }> =
  {
    open: { tone: "warning", label: "Open" },
    paused: { tone: "danger", label: "Paused" },
    resolved: { tone: "success", label: "Resolved" },
  };

const LOG_LABEL: Record<string, string> = {
  kill_switch_off: "Turned messaging off",
  kill_switch_on: "Turned messaging on",
  case_opened: "Opened a reported conversation",
  report_resolved: "Resolved a report",
  sender_paused: "Paused sending",
  sender_resumed: "Resumed sending",
  inbound_resumed: "Resumed requests",
  caps_saved: "Saved caps",
};

/**
 * Admin, Messaging (Amped Messages, Build Board #2 r4, PR M7, board m6). Reports with the
 * case view, paused people, caps, flagged terms and the admin log on G2 slabs, the health
 * strip, and the kill switch with a reason. Admins and moderators. Admins read a
 * conversation only after a report, and every read is logged.
 */
export function AdminMessaging() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("reports");
  const [caseId, setCaseId] = useState<string | null>(null);
  const [pauseFor, setPauseFor] = useState<Person | null>(null);
  const [killOpen, setKillOpen] = useState(false);
  const health = useQuery({
    ...trpc.admin.messaging.health.queryOptions(),
    refetchInterval: 30_000,
  });
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: trpc.admin.messaging.pathKey() });
  const turnOn = useMutation({
    ...trpc.admin.messaging.setEnabled.mutationOptions(),
    onSuccess: () => {
      refresh();
      toast.success("Messaging is on");
    },
    onError: e => toast.error(e.message),
  });

  const on = health.data?.enabled ?? true;
  const kpis: [string, string][] = health.data
    ? [
        ["Messages last hour", formatCount(health.data.messagesLastHour)],
        ["Live streams, this server", formatCount(health.data.liveStreamsHere)],
        [
          "Push delivered, 24 hr",
          health.data.pushDeliveredRate === null
            ? "None sent"
            : `${(health.data.pushDeliveredRate * 100).toFixed(1)}%`,
        ],
        ["Email reminders, 24 hr", formatCount(health.data.emailRemindersToday)],
        ["Open reports", formatCount(health.data.openReports)],
      ]
    : [];

  return (
    <div className="space-y-[21px] font-prism">
      <div className="flex flex-wrap items-center gap-3">
        <WordBadge tone={on ? "success" : "danger"}>
          {on ? "Messaging on" : "Messaging off"}
        </WordBadge>
        {health.data?.flagOff && (
          <span className="text-prism-meta text-prism-ink-2">
            Off by the messages feature flag (Feature flags). The switch here cannot turn it on.
          </span>
        )}
        <span className="flex-1" />
        {on ? (
          <Button variant="secondary" onClick={() => setKillOpen(true)}>
            Turn messaging off
          </Button>
        ) : (
          <Button
            onClick={() => turnOn.mutate({ enabled: true })}
            disabled={turnOn.isPending || !!health.data?.flagOff}
          >
            Turn messaging on
          </Button>
        )}
      </div>
      {!on && health.data?.off && (
        <Notice variant="warning" title="Every Inbox is read only">
          Turned off {formatDayTime(health.data.off.at)}. Reason: {health.data.off.reason}
        </Notice>
      )}

      <div
        aria-label="Messaging health"
        role="group"
        className="grid grid-cols-2 gap-[13px] sm:grid-cols-3 xl:grid-cols-5"
      >
        {health.isPending
          ? Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} delayMs={400} className="h-[89px] rounded-prism-21" />
            ))
          : kpis.map(([label, value]) => (
              <div key={label} className="prism-glass-clear !rounded-prism-21 p-[13px]">
                <p className="text-prism-eyebrow uppercase text-prism-ink-2">{label}</p>
                <p className="mt-1 text-[34px] font-bold leading-[42px] tabular-nums text-prism-ink">
                  {value}
                </p>
              </div>
            ))}
      </div>

      <Tabs
        value={tab}
        onValueChange={v => setTab(v as Tab)}
        className="grid min-w-0 grid-cols-[minmax(0,1fr)]"
      >
        <TabsList aria-label="Messaging sections" className="max-w-full overflow-x-auto">
          <TabsTrigger value="reports" className="gap-2">
            Reports
            <CountBadge count={health.data?.openReports ?? 0} variant="tab" />
          </TabsTrigger>
          <TabsTrigger value="paused">Paused</TabsTrigger>
          <TabsTrigger value="caps">Caps</TabsTrigger>
          <TabsTrigger value="flagged">Flagged terms</TabsTrigger>
          <TabsTrigger value="log">Log</TabsTrigger>
        </TabsList>
        <TabsContent value="reports" className="mt-[21px] min-w-0">
          <ReportsTab onReview={setCaseId} />
        </TabsContent>
        <TabsContent value="paused" className="mt-[21px] min-w-0">
          <PausedTab />
        </TabsContent>
        <TabsContent value="caps" className="mt-[21px] min-w-0">
          <CapsTab />
        </TabsContent>
        <TabsContent value="flagged" className="mt-[21px] min-w-0">
          <FlaggedTab onPause={setPauseFor} />
        </TabsContent>
        <TabsContent value="log" className="mt-[21px] min-w-0">
          <LogTab />
        </TabsContent>
      </Tabs>

      <CaseDialog
        reportId={caseId}
        onClose={() => setCaseId(null)}
        onPause={p => setPauseFor(p)}
        onChanged={refresh}
      />
      <PauseDialog person={pauseFor} onClose={() => setPauseFor(null)} onDone={refresh} />
      <KillDialog open={killOpen} onOpenChange={setKillOpen} onDone={refresh} />
    </div>
  );
}

// ------------------------------------------------------------------ reports

function ReportsTab({ onReview }: { onReview: (id: string) => void }) {
  const [status, setStatus] = useState<"open" | "resolved">("open");
  const reports = useQuery(trpc.admin.messaging.listReports.queryOptions({ status }));
  const columns = 7;
  return (
    <div className="space-y-[13px]">
      <div role="group" aria-label="Report status" className="flex gap-2">
        {(["open", "resolved"] as const).map(s => (
          <Button
            key={s}
            variant={status === s ? "default" : "secondary"}
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
          >
            {s === "open" ? "Open" : "Resolved"}
          </Button>
        ))}
      </div>
      <SlabTable label="Message reports">
        <thead>
          <tr>
            <th scope="col" className={cn(thClass, stickyCell)}>
              Reported
            </th>
            <th scope="col" className={thClass}>
              By
            </th>
            <th scope="col" className={thClass}>
              Reason
            </th>
            <th scope="col" className={thClass}>
              Snapshot
            </th>
            <th scope="col" className={thClass}>
              Age
            </th>
            <th scope="col" className={thClass}>
              Status
            </th>
            <th scope="col" className={thClass}>
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        {reports.isPending ? (
          <SlabSkeletonRows columns={columns} rows={4} />
        ) : reports.isError ? (
          <SlabMessageRow columns={columns}>
            <ErrorCard
              title="Reports did not load"
              cause="Check your connection and try again."
              onRetry={() => void reports.refetch()}
              className="m-[13px]"
            />
          </SlabMessageRow>
        ) : reports.data.length === 0 ? (
          <SlabMessageRow columns={columns}>
            <p className="px-[21px] py-[34px] text-center text-prism-body text-prism-ink-2">
              {status === "open" ? "No open reports." : "No resolved reports yet."}
            </p>
          </SlabMessageRow>
        ) : (
          <tbody>
            {reports.data.map(r => (
              <tr key={r.id} className={rowClass}>
                <td className={cn(tdClass, stickyCell, "py-2")}>
                  <span className="block text-prism-label font-bold text-prism-ink">
                    {who(r.reported)}
                  </span>
                  <span className="block text-prism-meta text-prism-ink-2">
                    {r.folder === "REQUESTS" ? "Request" : "Primary"} · {r.sentToday} sent today
                  </span>
                </td>
                <td className={cn(tdClass, "text-prism-label text-prism-ink")}>
                  {who(r.reporter)}
                </td>
                <td className={cn(tdClass, "text-prism-label text-prism-ink")}>
                  {REASON[r.reason] ?? r.reason}
                </td>
                <td className={cn(tdClass, "max-w-[320px] text-prism-meta text-prism-ink-2")}>
                  <span className="line-clamp-2">
                    {r.wholeConversation
                      ? "Whole conversation"
                      : r.snapshot
                        ? `${r.snapshot}${r.unsent ? " · unsent after report, snapshot kept" : ""}`
                        : "Text not available"}
                  </span>
                </td>
                <td
                  className={cn(
                    tdClass,
                    "whitespace-nowrap text-prism-meta tabular-nums text-prism-ink-2"
                  )}
                >
                  {age(r.createdAt)}
                </td>
                <td className={tdClass}>
                  <WordBadge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</WordBadge>
                </td>
                <td className={cn(tdClass, "text-right")}>
                  <Button
                    variant="ghost"
                    onClick={() => onReview(r.id)}
                    aria-label={`Review report on ${who(r.reported)}`}
                  >
                    {r.status === "resolved" ? "Open" : "Review"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        )}
      </SlabTable>
      <p className="text-prism-meta text-prism-ink-2">
        Admins read a conversation only after someone reports it. Opening a case is logged.
      </p>
    </div>
  );
}

function CaseDialog({
  reportId,
  onClose,
  onPause,
  onChanged,
}: {
  reportId: string | null;
  onClose: () => void;
  onPause: (person: Person) => void;
  onChanged: () => void;
}) {
  const kase = useQuery({
    ...trpc.admin.messaging.reportCase.queryOptions({ reportId: reportId ?? "" }),
    enabled: !!reportId,
    staleTime: 60_000,
  });
  const resolve = useMutation({
    ...trpc.admin.messaging.resolveReport.mutationOptions(),
    onSuccess: () => {
      onChanged();
      onClose();
      toast.success("Report resolved");
    },
    onError: e => toast.error(e.message),
  });
  const data = kase.data;
  const reporterId = data?.reporter?.id;
  const reported = data?.people.find(p => p.id !== reporterId) ?? null;

  return (
    <Dialog open={!!reportId} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex-1">Report · {who(reported)}</span>
            {data && (
              <WordBadge tone={data.resolvedAt ? "success" : "warning"}>
                {data.resolvedAt ? "Resolved" : "Open"}
              </WordBadge>
            )}
          </DialogTitle>
          <DialogDescription>
            {data
              ? `Reported by ${who(data.reporter)} · ${REASON[data.reason] ?? data.reason} · ${age(data.createdAt)} ago · Admins see only reported conversations`
              : "Loading the reported conversation"}
          </DialogDescription>
        </DialogHeader>
        {kase.isError ? (
          <ErrorCard title="The conversation did not load" onRetry={() => void kase.refetch()} />
        ) : !data ? (
          <div className="space-y-2" aria-busy>
            {[50, 70, 40].map((w, i) => (
              <Skeleton key={i} className="h-10 rounded-[21px]" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : (
          <>
            {data.note && <Notice title="Reporter's note">{data.note}</Notice>}
            <ol
              aria-label="Reported conversation"
              className="prism-slab flex max-h-[360px] flex-col gap-1 overflow-y-auto p-[13px]"
            >
              {data.messages.map(m => {
                const fromReporter = m.senderId === reporterId;
                return (
                  <li
                    key={m.id}
                    className={cn("flex flex-col", fromReporter ? "items-end" : "items-start")}
                  >
                    <MessageBubble
                      mine={fromReporter}
                      removed={m.unsent && !m.body}
                      className={cn(m.reported && "ring-2 ring-prism-danger")}
                    >
                      {m.body ?? MESSAGE_UI.removed}
                    </MessageBubble>
                    <span className="mt-1 text-[12px] leading-4 text-prism-ink-3">
                      {formatDayTime(m.createdAt)}
                      {m.reported && <b className="ml-2 text-prism-danger">Reported</b>}
                      {m.unsent && m.body && <span className="ml-2">Unsent, snapshot kept</span>}
                      {m.flagged && <span className="ml-2">Flagged terms</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
            <DialogFooter className="flex-wrap gap-[13px]">
              {reported?.handle && (
                <Button variant="ghost" asChild>
                  <a
                    href={publicPageUrl(reported.handle)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open the account
                  </a>
                </Button>
              )}
              {!data.resolvedAt && (
                <Button
                  variant="secondary"
                  onClick={() => resolve.mutate({ reportId: data.reportId })}
                  disabled={resolve.isPending}
                >
                  Resolve, no action
                </Button>
              )}
              {reported && (
                <Button
                  onClick={() => {
                    onPause(reported);
                    onClose();
                  }}
                >
                  Pause sender
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ paused

function PausedTab() {
  const queryClient = useQueryClient();
  const paused = useQuery(trpc.admin.messaging.listPaused.queryOptions());
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: trpc.admin.messaging.pathKey() });
  const resumeSender = useMutation({
    ...trpc.admin.messaging.resumeSender.mutationOptions(),
    onSuccess: refresh,
    onError: e => toast.error(e.message),
  });
  const resumeInbound = useMutation({
    ...trpc.admin.messaging.resumeInbound.mutationOptions(),
    onSuccess: refresh,
    onError: e => toast.error(e.message),
  });
  const columns = 5;
  return (
    <div className="space-y-[13px]">
      <SlabTable label="Paused people">
        <thead>
          <tr>
            <th scope="col" className={cn(thClass, stickyCell)}>
              Person
            </th>
            <th scope="col" className={thClass}>
              Paused
            </th>
            <th scope="col" className={thClass}>
              Until
            </th>
            <th scope="col" className={thClass}>
              Reason
            </th>
            <th scope="col" className={thClass}>
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        {paused.isPending ? (
          <SlabSkeletonRows columns={columns} rows={3} />
        ) : paused.isError ? (
          <SlabMessageRow columns={columns}>
            <ErrorCard
              title="Paused people did not load"
              onRetry={() => void paused.refetch()}
              className="m-[13px]"
            />
          </SlabMessageRow>
        ) : paused.data.length === 0 ? (
          <SlabMessageRow columns={columns}>
            <p className="px-[21px] py-[34px] text-center text-prism-body text-prism-ink-2">
              Nobody is paused.
            </p>
          </SlabMessageRow>
        ) : (
          <tbody>
            {paused.data.map(row => (
              <tr key={`${row.kind}-${row.person.id}`} className={rowClass}>
                <td className={cn(tdClass, stickyCell, "py-2")}>
                  <span className="block text-prism-label font-bold text-prism-ink">
                    {who(row.person)}
                  </span>
                  <span className="block text-prism-meta text-prism-ink-2">
                    {row.kind === "sending" ? "Cannot send" : "Takes no requests"}
                  </span>
                </td>
                <td className={cn(tdClass, "text-prism-meta text-prism-ink-2")}>
                  {formatDayTime(row.pausedAt)}
                </td>
                <td className={cn(tdClass, "text-prism-meta text-prism-ink-2")}>
                  {row.pausedUntil ? formatDayTime(row.pausedUntil) : "Until resumed"}
                </td>
                <td className={cn(tdClass, "max-w-[280px] text-prism-meta text-prism-ink-2")}>
                  {row.reason ?? ""}
                </td>
                <td className={cn(tdClass, "text-right")}>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      row.kind === "sending"
                        ? resumeSender.mutate({ userId: row.person.id })
                        : resumeInbound.mutate({ userId: row.person.id })
                    }
                  >
                    Resume
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        )}
      </SlabTable>
      <p className="text-prism-meta text-prism-ink-2">
        Three blocks in 7 days pause sending for 24 hours on their own. Reports from 1% of a
        person's conversations, at least 5 people, stop their requests until resumed here.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ caps

const CAP_FIELDS = [
  ["sendsPerConversationPerHour", "Messages per conversation per hour"],
  ["sendsPerDay", "Messages per account per day"],
  ["newConversationsPerDay", "New conversations per day"],
  ["newAccountConversationsPerDay", "New conversations per day, accounts under 7 days"],
  ["messagesBeforeAccept", "Messages before a request is accepted"],
] as const;
type CapName = (typeof CAP_FIELDS)[number][0];

function CapsTab() {
  const queryClient = useQueryClient();
  const caps = useQuery(trpc.admin.messaging.caps.queryOptions());
  const [values, setValues] = useState<Record<CapName, string> | null>(null);
  useEffect(() => {
    if (caps.data && !values) {
      setValues(
        Object.fromEntries(CAP_FIELDS.map(([k]) => [k, String(caps.data.current[k])])) as Record<
          CapName,
          string
        >
      );
    }
  }, [caps.data, values]);
  const save = useMutation({
    ...trpc.admin.messaging.setCaps.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.admin.messaging.pathKey() });
      toast.success("Caps saved. Every server uses them within a minute.");
    },
    onError: e => toast.error(e.message),
  });
  if (caps.isError)
    return <ErrorCard title="Caps did not load" onRetry={() => void caps.refetch()} />;
  if (!caps.data || !values)
    return <Skeleton delayMs={400} className="h-[233px] rounded-prism-21" />;
  const parsed = Object.fromEntries(CAP_FIELDS.map(([k]) => [k, Number(values[k])])) as Record<
    CapName,
    number
  >;
  const invalid = CAP_FIELDS.some(
    ([k]) => !/^\d+$/.test(values[k]) || (k !== "newAccountConversationsPerDay" && parsed[k] < 1)
  );
  return (
    <form
      className="prism-glass-clear space-y-[21px] p-[21px]"
      onSubmit={e => {
        e.preventDefault();
        if (!invalid) save.mutate(parsed);
      }}
    >
      <div className="grid gap-[13px] sm:grid-cols-2 xl:grid-cols-3">
        {CAP_FIELDS.map(([k, label]) => (
          <label key={k} className="block space-y-2">
            <span className="block text-prism-meta font-semibold text-prism-ink">{label}</span>
            <input
              inputMode="numeric"
              value={values[k]}
              onChange={e => setValues({ ...values, [k]: e.target.value.replace(/\D/g, "") })}
              className="prism-well prism-focus block h-touch w-full rounded-prism-13 px-3 text-prism-label tabular-nums text-prism-ink outline-none"
            />
            <span className="block text-[12px] leading-4 text-prism-ink-3">
              Default {caps.data.defaults[k]}
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-[13px]">
        {invalid && <span className="text-prism-meta text-prism-danger">Enter whole numbers.</span>}
        <Button type="submit" size="lg" disabled={invalid || save.isPending}>
          Save caps
        </Button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ flagged

function FlaggedTab({ onPause }: { onPause: (p: Person) => void }) {
  const flagged = useQuery(trpc.admin.messaging.flagged.queryOptions({ days: 30 }));
  const columns = 5;
  return (
    <div className="space-y-[13px]">
      <SlabTable label="Flagged terms">
        <thead>
          <tr>
            <th scope="col" className={cn(thClass, stickyCell)}>
              Sender
            </th>
            <th scope="col" className={thClass}>
              Messages
            </th>
            <th scope="col" className={thClass}>
              Matched words
            </th>
            <th scope="col" className={thClass}>
              Last
            </th>
            <th scope="col" className={thClass}>
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        {flagged.isPending ? (
          <SlabSkeletonRows columns={columns} rows={3} />
        ) : flagged.isError ? (
          <SlabMessageRow columns={columns}>
            <ErrorCard
              title="Flagged terms did not load"
              onRetry={() => void flagged.refetch()}
              className="m-[13px]"
            />
          </SlabMessageRow>
        ) : flagged.data.length === 0 ? (
          <SlabMessageRow columns={columns}>
            <p className="px-[21px] py-[34px] text-center text-prism-body text-prism-ink-2">
              No flagged messages in the last 30 days.
            </p>
          </SlabMessageRow>
        ) : (
          <tbody>
            {flagged.data.map(row => (
              <tr key={row.person.id} className={rowClass}>
                <td
                  className={cn(tdClass, stickyCell, "text-prism-label font-bold text-prism-ink")}
                >
                  {who(row.person)}
                </td>
                <td className={cn(tdClass, "tabular-nums text-prism-label text-prism-ink")}>
                  {row.count}
                </td>
                <td className={cn(tdClass, "max-w-[360px] text-prism-meta text-prism-ink-2")}>
                  {row.phrases.join(", ")}
                </td>
                <td className={cn(tdClass, "text-prism-meta text-prism-ink-2")}>
                  {formatDayTime(row.lastAt)}
                </td>
                <td className={cn(tdClass, "text-right")}>
                  {row.paused ? (
                    <WordBadge tone="danger">Paused</WordBadge>
                  ) : (
                    <Button variant="ghost" onClick={() => onPause(row.person)}>
                      Pause
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        )}
      </SlabTable>
      <p className="text-prism-meta text-prism-ink-2">
        Sending is never blocked by these words; the sender sees a warning. This list shows the
        words only. The message text opens only from a report.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ log

function LogTab() {
  const log = useQuery(trpc.admin.messaging.log.queryOptions());
  const columns = 4;
  return (
    <SlabTable label="Admin log">
      <thead>
        <tr>
          <th scope="col" className={cn(thClass, stickyCell)}>
            When
          </th>
          <th scope="col" className={thClass}>
            Who
          </th>
          <th scope="col" className={thClass}>
            Action
          </th>
          <th scope="col" className={thClass}>
            Detail
          </th>
        </tr>
      </thead>
      {log.isPending ? (
        <SlabSkeletonRows columns={columns} rows={4} />
      ) : log.isError ? (
        <SlabMessageRow columns={columns}>
          <ErrorCard
            title="The log did not load"
            onRetry={() => void log.refetch()}
            className="m-[13px]"
          />
        </SlabMessageRow>
      ) : log.data.length === 0 ? (
        <SlabMessageRow columns={columns}>
          <p className="px-[21px] py-[34px] text-center text-prism-body text-prism-ink-2">
            Nothing logged yet.
          </p>
        </SlabMessageRow>
      ) : (
        <tbody>
          {log.data.map((e, i) => (
            <tr key={`${e.at}-${i}`} className={rowClass}>
              <td
                className={cn(
                  tdClass,
                  stickyCell,
                  "whitespace-nowrap text-prism-meta text-prism-ink-2"
                )}
              >
                {formatDayTime(e.at)}
              </td>
              <td className={cn(tdClass, "text-prism-label text-prism-ink")}>{who(e.actor)}</td>
              <td className={cn(tdClass, "text-prism-label text-prism-ink")}>
                {LOG_LABEL[e.action] ?? e.action}
              </td>
              <td className={cn(tdClass, "max-w-[360px] text-prism-meta text-prism-ink-2")}>
                {[e.target, e.reason].filter(Boolean).join(" · ")}
              </td>
            </tr>
          ))}
        </tbody>
      )}
    </SlabTable>
  );
}

// ------------------------------------------------------------------ dialogs

function PauseDialog({
  person,
  onClose,
  onDone,
}: {
  person: Person | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [hours, setHours] = useState<24 | null>(24);
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (person) {
      setHours(24);
      setReason("");
    }
  }, [person]);
  const pause = useMutation({
    ...trpc.admin.messaging.pauseSender.mutationOptions(),
    onSuccess: () => {
      onDone();
      onClose();
      toast.success(`${who(person)} is paused`);
    },
    onError: e => toast.error(e.message),
  });
  const ok = reason.trim().length >= 3;
  return (
    <Dialog open={!!person} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pause {who(person)}?</DialogTitle>
          <DialogDescription>
            They cannot send messages while paused. They can still read. They see "You can't send
            messages right now."
          </DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-1">
          <legend className="text-prism-label font-semibold text-prism-ink">How long</legend>
          {([24, null] as const).map(h => (
            <label
              key={String(h)}
              className="flex min-h-touch cursor-pointer items-center gap-3 text-prism-label text-prism-ink"
            >
              <input
                type="radio"
                name="pause-hours"
                checked={hours === h}
                onChange={() => setHours(h)}
                className="h-5 w-5 accent-prism-nav"
              />
              {h ? "24 hours" : "Until resumed"}
            </label>
          ))}
        </fieldset>
        <label className="block space-y-2">
          <span className="block text-prism-label font-semibold text-prism-ink">
            Reason, shown in the admin log
          </span>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            maxLength={200}
            rows={3}
            className="prism-well prism-focus block w-full rounded-prism-13 px-4 py-3 text-prism-body text-prism-ink"
          />
        </label>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!ok || pause.isPending}
            onClick={() =>
              person && pause.mutate({ userId: person.id, hours, reason: reason.trim() })
            }
          >
            Pause sender
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KillDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const off = useMutation({
    ...trpc.admin.messaging.setEnabled.mutationOptions(),
    onSuccess: () => {
      onDone();
      onOpenChange(false);
      setReason("");
      toast.success("Messaging is off. Every Inbox is read only.");
    },
    onError: e => toast.error(e.message),
  });
  const ok = reason.trim().length >= 3;
  return (
    <Dialog open={open} onOpenChange={next => !off.isPending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Turn messaging off?</DialogTitle>
          <DialogDescription>
            Every Inbox becomes read only. No one can send until you turn it back on. Broadcast is
            not affected.
          </DialogDescription>
        </DialogHeader>
        <label className="block space-y-2">
          <span className="block text-prism-label font-semibold text-prism-ink">
            Reason, shown in the admin log
          </span>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            maxLength={200}
            rows={3}
            className="prism-well prism-focus block w-full rounded-prism-13 px-4 py-3 text-prism-body text-prism-ink"
          />
        </label>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={off.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!ok || off.isPending}
            onClick={() => off.mutate({ enabled: false, reason: reason.trim() })}
          >
            Turn messaging off
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
