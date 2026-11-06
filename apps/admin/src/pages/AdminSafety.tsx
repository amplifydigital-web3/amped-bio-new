import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye, EyeOff, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  SAFETY_CASE_LABELS,
  SAFETY_CASE_TYPES,
  SAFETY_NOTE_MIN,
  SAFETY_REASON_CODES,
  SAFETY_REASON_KEYS,
  SAFETY_SEVERITY_LABELS,
  type SafetyCaseType,
  type SafetyOutcome,
  type SafetyReasonCode,
} from "@repo/constants";
import {
  Button,
  ErrorCard,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  cn,
  trpc,
  trpcClient,
  useAuth,
  type RouterOutputs,
} from "@repo/ui";
import { SlabHead, SlabTable, rowClass, stickyCell, tdClass, thClass } from "../kit/Slab";
import { WordBadge, type BadgeTone } from "../kit/WordBadge";
import { formatCount, formatDayTime } from "../kit/format";
import { rolesOf } from "../shell/destinations";

/**
 * Safety, Review (Build Board #28, adult content review 8.1, 8.2, 8.5 and 8.7, PRs R1
 * and R2). Queue, the case view with blur and reveal, decisions with the keyboard
 * (C clear, L label, A ask, R remove, E escalate, J and K next and previous), and the
 * Blocked files list. Moderators and safety leads only. Full review (reveal) is for
 * a desktop: on a phone the viewer stays blurred (8.10).
 */

type Row = RouterOutputs["safety"]["queue"]["list"]["items"][number];
type CaseView = RouterOutputs["safety"]["case"]["get"];

const SEVERITY_TONE: BadgeTone[] = ["danger", "warning", "neutral"];

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "That did not work. Try again.";
}

export function AdminSafety() {
  const [params, setParams] = useSearchParams();
  const caseId = params.get("case");
  const [tab, setTab] = useState(params.get("tab") ?? "queue");
  const { authUser } = useAuth();
  const lead = rolesOf(authUser?.role).includes("safety_lead");

  if (caseId) {
    return (
      <CasePanel
        id={caseId}
        lead={lead}
        onClose={() => setParams({})}
        onOpen={next => setParams({ case: next })}
      />
    );
  }

  return (
    <div className="space-y-[21px]">
      <Overview />
      <Tabs
        value={tab}
        onValueChange={value => {
          setTab(value);
          setParams(value === "queue" ? {} : { tab: value });
        }}
      >
        <TabsList>
          <TabsTrigger value="queue">Queue</TabsTrigger>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="blocked">Blocked files</TabsTrigger>
        </TabsList>
        <TabsContent value="queue">
          <Queue lead={lead} onOpen={id => setParams({ case: id })} />
        </TabsContent>
        <TabsContent value="requests">
          <Requests lead={lead} />
        </TabsContent>
        <TabsContent value="blocked">
          <BlockedFiles lead={lead} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Overview() {
  const overview = useQuery(trpc.safety.overview.queryOptions());
  if (overview.isError) {
    return (
      <ErrorCard
        title="Safety did not load"
        cause="The case counts could not be read. Try again."
        retryLabel="Retry"
        onRetry={() => void overview.refetch()}
      />
    );
  }
  const data = overview.data;
  const clock = data?.takedownClock ?? null;
  const tiles: Array<[string, string]> = data
    ? [
        ["Open", formatCount(data.open)],
        ["Overdue", formatCount(data.overdue)],
        ["Due today", formatCount(data.dueToday)],
        ["Take It Down clock", clock ? `Due ${formatDayTime(clock.dueAt)}` : "None open"],
      ]
    : [];
  return (
    <div
      aria-label="Queue summary"
      role="group"
      className="grid grid-cols-2 gap-[13px] xl:grid-cols-4"
    >
      {overview.isPending
        ? Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} delayMs={400} className="h-[89px] rounded-prism-21" />
          ))
        : tiles.map(([label, value]) => (
            <div key={label} className="prism-glass-clear !rounded-prism-21 p-[13px]">
              <p className="text-prism-eyebrow uppercase text-prism-ink-2">{label}</p>
              <p className="mt-1 text-[28px] font-bold leading-[34px] tabular-nums text-prism-ink">
                {value}
              </p>
            </div>
          ))}
    </div>
  );
}

function Queue({ lead, onOpen }: { lead: boolean; onOpen: (id: string) => void }) {
  const [type, setType] = useState<SafetyCaseType | "">("");
  const [mine, setMine] = useState(false);
  const [unassigned, setUnassigned] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const list = useQuery(
    trpc.safety.queue.list.queryOptions({
      ...(type ? { type } : {}),
      mine: mine || undefined,
      unassigned: unassigned || undefined,
      overdue: overdue || undefined,
    })
  );
  const types = lead ? SAFETY_CASE_TYPES : SAFETY_CASE_TYPES.filter(t => t !== "CHILD_SAFETY");

  return (
    <div className="space-y-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-prism-meta text-prism-ink-2">
          Type
          <select
            value={type}
            onChange={event => setType(event.target.value as SafetyCaseType | "")}
            className="h-touch rounded-prism-13 border border-prism-line bg-white px-3 text-prism-body text-prism-ink"
          >
            <option value="">All</option>
            {types.map(t => (
              <option key={t} value={t}>
                {SAFETY_CASE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        {(
          [
            ["Mine", mine, setMine],
            ["Unassigned", unassigned, setUnassigned],
            ["Overdue", overdue, setOverdue],
          ] as const
        ).map(([label, on, set]) => (
          <button
            key={label}
            type="button"
            aria-pressed={on}
            onClick={() => set(!on)}
            className={cn(
              "h-touch rounded-full border px-4 text-prism-label font-semibold",
              on ? "border-prism-nav bg-prism-nav text-white" : "border-prism-line text-prism-ink"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {list.isError ? (
        <ErrorCard
          title="The queue did not load"
          cause="Try again."
          retryLabel="Retry"
          onRetry={() => void list.refetch()}
        />
      ) : (
        <SlabTable label="Open cases">
          <SlabHead>
            <th className={cn(thClass, stickyCell)}>Case</th>
            <th className={thClass}>Type</th>
            <th className={thClass}>Creator</th>
            <th className={thClass}>Opened</th>
            <th className={thClass}>Due</th>
            <th className={thClass}>Assignee</th>
          </SlabHead>
          <tbody>
            {list.isPending
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className={rowClass}>
                    <td colSpan={6} className={tdClass}>
                      <Skeleton delayMs={400} className="h-4 w-full" />
                    </td>
                  </tr>
                ))
              : list.data.items.map(row => <QueueRow key={row.id} row={row} onOpen={onOpen} />)}
            {list.data?.items.length === 0 && (
              <tr className={rowClass}>
                <td colSpan={6} className={cn(tdClass, "text-prism-ink-2")}>
                  No open cases match.
                </td>
              </tr>
            )}
          </tbody>
        </SlabTable>
      )}
    </div>
  );
}

function QueueRow({ row, onOpen }: { row: Row; onOpen: (id: string) => void }) {
  return (
    <tr className={cn(rowClass, "cursor-pointer hover:bg-white/60")} onClick={() => onOpen(row.id)}>
      <td className={cn(tdClass, stickyCell)}>
        <button
          type="button"
          className="flex items-center gap-3 text-left"
          onClick={() => onOpen(row.id)}
        >
          {row.thumb ? (
            <img
              src={row.thumb}
              alt=""
              className="h-10 w-10 rounded-prism-8 object-cover blur-sm grayscale"
            />
          ) : (
            <span
              className="flex h-10 w-10 items-center justify-center rounded-prism-8 bg-prism-line"
              title={row.type === "CHILD_SAFETY" ? "Hidden, child safety" : "No preview"}
            >
              <ShieldAlert aria-hidden className="h-5 w-5 text-prism-ink-2" />
            </span>
          )}
          <span className="font-semibold tabular-nums text-prism-ink">{row.number}</span>
        </button>
      </td>
      <td className={tdClass}>
        <span className="flex items-center gap-2">
          <WordBadge tone={SEVERITY_TONE[row.severity] ?? "neutral"}>
            {SAFETY_SEVERITY_LABELS[row.severity]}
          </WordBadge>
          {SAFETY_CASE_LABELS[row.type]}
        </span>
      </td>
      <td className={tdClass}>{row.creator ? `@${row.creator}` : "None"}</td>
      <td className={tdClass}>{formatDayTime(row.createdAt)}</td>
      <td className={cn(tdClass, row.overdue && "font-semibold text-prism-danger")}>
        {formatDayTime(row.dueAt)}
      </td>
      <td className={tdClass}>{row.assignee ?? "Unassigned"}</td>
    </tr>
  );
}

// ----------------------------------------------------------------------------
// Case view (board ad2)
// ----------------------------------------------------------------------------

function CasePanel({
  id,
  lead,
  onClose,
  onOpen,
}: {
  id: string;
  lead: boolean;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const client = useQueryClient();
  const view = useQuery(trpc.safety.case.get.queryOptions({ id }));
  const queue = useQuery(trpc.safety.queue.list.queryOptions({}));
  const ids = queue.data?.items.map(row => row.id) ?? [];
  const index = ids.indexOf(id);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: trpc.safety.case.get.queryKey({ id }) });
    void client.invalidateQueries({ queryKey: trpc.safety.queue.list.queryKey() });
    void client.invalidateQueries({ queryKey: trpc.safety.overview.queryKey() });
  };

  // Claim on open (8.1): the case is this reviewer's while they work on it
  useEffect(() => {
    trpcClient.safety.case.claim.mutate({ id }).catch(() => undefined);
  }, [id]);

  if (view.isError) {
    return (
      <ErrorCard
        title="This case did not load"
        cause={errorMessage(view.error)}
        retryLabel="Back to the queue"
        onRetry={onClose}
      />
    );
  }
  if (view.isPending)
    return <Skeleton delayMs={400} className="h-[377px] w-full rounded-prism-21" />;
  const data = view.data;

  return (
    <div className="space-y-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          <ArrowLeft aria-hidden />
          Queue
        </Button>
        <h2 className="text-prism-panel-title text-prism-ink">
          {data.number} · {SAFETY_CASE_LABELS[data.type]}
        </h2>
        <WordBadge tone={SEVERITY_TONE[data.severity] ?? "neutral"}>
          {SAFETY_SEVERITY_LABELS[data.severity]}
        </WordBadge>
        <span className="text-prism-meta text-prism-ink-2">Due {formatDayTime(data.dueAt)}</span>
      </div>
      <div className="grid gap-[13px] lg:grid-cols-[minmax(0,1fr)_420px]">
        <Viewer data={data} />
        <div className="space-y-[13px]">
          <Facts data={data} />
          <Decision
            data={data}
            lead={lead}
            onDone={() => {
              refresh();
              const next = ids[index + 1] ?? ids[index - 1];
              if (next && next !== id) onOpen(next);
              else onClose();
            }}
            onPrev={() => index > 0 && onOpen(ids[index - 1]!)}
            onNext={() => index >= 0 && index < ids.length - 1 && onOpen(ids[index + 1]!)}
          />
          {data.delivery && <DeliveryLine id={id} data={data} lead={lead} onRetried={refresh} />}
        </div>
      </div>
      <Log data={data} />
    </div>
  );
}

function Viewer({ data }: { data: CaseView }) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const reveal = useMutation(trpc.safety.case.reveal.mutationOptions());
  const visual =
    data.item?.assets.find(a => a.role === "RENDITION") ??
    data.item?.assets.find(a => a.role === "COVER");

  if (data.noMedia) {
    return (
      <section className="prism-slab flex min-h-[233px] flex-col items-center justify-center gap-2 p-[21px] text-center">
        <ShieldAlert aria-hidden className="h-8 w-8 text-prism-danger" />
        <p className="text-prism-body font-semibold text-prism-ink">Hidden, child safety</p>
        <p className="text-prism-meta text-prism-ink-2">
          No media and no thumbnail. Follow the child safety steps: evidence, then the CyberTipline
          report.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Media" className="prism-slab space-y-[13px] p-[13px]">
      <div className="relative flex min-h-[233px] items-center justify-center overflow-hidden rounded-prism-13 bg-prism-line">
        {revealed ? (
          <img src={revealed} alt="" className="max-h-[610px] w-full object-contain" />
        ) : (
          <p className="text-prism-meta text-prism-ink-2">
            Blurred. Reveal opens one file for 60 seconds.
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {visual && (
          <Button
            type="button"
            variant="outline"
            className="hidden md:inline-flex"
            disabled={reveal.isPending}
            onClick={async () => {
              if (revealed) {
                setRevealed(null);
                return;
              }
              try {
                const result = await reveal.mutateAsync({
                  id: data.id,
                  role: visual.role as "RENDITION" | "COVER",
                  variant: visual.variant,
                });
                setRevealed(result.url);
              } catch (error) {
                toast.error(errorMessage(error));
              }
            }}
          >
            {revealed ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            {revealed ? "Blur" : "Reveal"}
          </Button>
        )}
        <span className="self-center text-prism-meta text-prism-ink-2">
          {data.item?.kind.toLowerCase()} · every reveal is logged
        </span>
      </div>
    </section>
  );
}

function Facts({ data }: { data: CaseView }) {
  const rows: Array<[string, string]> = [];
  if (data.item) {
    rows.push(
      ["Title", data.item.title ?? "Hidden"],
      ["Kind", data.item.kind.toLowerCase()],
      ["Uploaded", formatDayTime(data.item.uploadedAt)],
      ["18+", data.item.adult ? "Labeled" : "Not labeled"],
      ["AI label", data.item.aiLabel === null ? "Not answered" : data.item.aiLabel ? "Yes" : "No"],
      ["State", `${data.item.status.toLowerCase()}, ${data.item.moderationState.toLowerCase()}`],
      ["sha256", data.item.sha256 ? data.item.sha256.slice(0, 12) : "None"]
    );
  }
  if (data.creator) {
    rows.push(
      ["Creator", data.creator.handle ? `@${data.creator.handle}` : data.creator.name],
      [
        "18+ on since",
        data.creator.adultOnSince ? formatDayTime(data.creator.adultOnSince) : "Off",
      ],
      ["Strikes, 12 months", formatCount(data.creator.strikes12m)],
      ["Open cases", formatCount(data.creator.openCases)]
    );
  }
  return (
    <section aria-label="Facts" className="prism-slab p-[13px]">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-[13px] gap-y-1 text-prism-meta">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-prism-ink-2">{label}</dt>
            <dd className="break-words text-prism-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {data.reports.length > 0 && (
        <ul className="mt-[13px] space-y-1 text-prism-meta text-prism-ink">
          {data.reports.map((report, i) => (
            <li key={i}>
              Report: {report.reason}
              {report.details ? `, "${report.details}"` : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const DECISIONS: Array<{ outcome: SafetyOutcome; label: string; key: string }> = [
  { outcome: "clear", label: "Clear", key: "c" },
  { outcome: "label_clear", label: "Label 18+ and clear", key: "l" },
  { outcome: "needs_change", label: "Ask for a change", key: "a" },
  { outcome: "removed", label: "Remove", key: "r" },
];

function Decision({
  data,
  lead,
  onDone,
  onPrev,
  onNext,
}: {
  data: CaseView;
  lead: boolean;
  onDone: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [outcome, setOutcome] = useState<SafetyOutcome | "escalate" | null>(null);
  const [reason, setReason] = useState<SafetyReasonCode | "">("");
  const [note, setNote] = useState("");
  const [strike, setStrike] = useState(false);
  const [blockFile, setBlockFile] = useState<boolean | null>(null);
  const [escalateKind, setEscalateKind] = useState<"child_safety" | "trafficking">("child_safety");
  const decide = useMutation(trpc.safety.case.decide.mutationOptions());
  const escalate = useMutation(trpc.safety.case.escalate.mutationOptions());
  const decided = !["OPEN", "CLAIMED", "WAITING_CREATOR"].includes(data.state);
  const blockDefault = reason ? SAFETY_REASON_CODES[reason].blockDefault : false;
  const blockOn = blockFile ?? blockDefault;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "j") onNext();
      else if (key === "k") onPrev();
      else if (key === "e") setOutcome("escalate");
      else {
        const hit = DECISIONS.find(d => d.key === key);
        if (hit) setOutcome(hit.outcome);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext, onPrev]);

  if (decided || data.type === "CHILD_SAFETY") {
    return (
      <section className="prism-slab p-[13px] text-prism-meta text-prism-ink-2">
        {decided
          ? `Decided: ${data.outcome ?? data.state.toLowerCase()}.`
          : "A safety lead closes this case with the CyberTipline report."}
      </section>
    );
  }

  const needsReason = outcome === "needs_change" || outcome === "removed";
  const noteOk = note.trim().length >= SAFETY_NOTE_MIN;
  const ready = outcome && noteOk && (!needsReason || reason);

  const submit = async () => {
    if (!outcome || !ready) return;
    try {
      if (outcome === "escalate") {
        const result = await escalate.mutateAsync({ id: data.id, kind: escalateKind, note });
        toast.success(`Escalated to ${result.number}`);
      } else {
        await decide.mutateAsync({
          id: data.id,
          outcome,
          note,
          ...(reason ? { reasonCode: reason } : {}),
          ...(outcome === "removed" ? { strike, blockFile: blockOn } : {}),
        });
        toast.success("Decided");
      }
      onDone();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <section aria-label="Decision" className="prism-slab space-y-[13px] p-[13px]">
      <div className="flex flex-wrap gap-2">
        {DECISIONS.map(d => (
          <Button
            key={d.outcome}
            type="button"
            variant={outcome === d.outcome ? "default" : "outline"}
            aria-keyshortcuts={d.key.toUpperCase()}
            onClick={() => setOutcome(d.outcome)}
          >
            {d.label}
          </Button>
        ))}
        <Button
          type="button"
          variant={outcome === "escalate" ? "destructive" : "outline"}
          aria-keyshortcuts="E"
          onClick={() => setOutcome("escalate")}
        >
          Escalate
        </Button>
      </div>
      {needsReason && (
        <label className="block text-prism-meta text-prism-ink-2">
          Reason
          <select
            value={reason}
            onChange={event => {
              setReason(event.target.value as SafetyReasonCode | "");
              setBlockFile(null);
            }}
            className="mt-1 h-touch w-full rounded-prism-13 border border-prism-line bg-white px-3 text-prism-body text-prism-ink"
          >
            <option value="">Choose a reason</option>
            {SAFETY_REASON_KEYS.map(code => (
              <option key={code} value={code}>
                {SAFETY_REASON_CODES[code].label}
              </option>
            ))}
          </select>
        </label>
      )}
      {outcome === "removed" && (
        <div className="space-y-1 text-prism-meta text-prism-ink">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={blockOn}
              onChange={e => setBlockFile(e.target.checked)}
            />
            Block this file everywhere
          </label>
          {lead && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={strike} onChange={e => setStrike(e.target.checked)} />
              Add a strike
            </label>
          )}
        </div>
      )}
      {outcome === "escalate" && (
        <fieldset className="space-y-1 text-prism-meta text-prism-ink">
          <legend className="text-prism-ink-2">Escalate to</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="escalate"
              checked={escalateKind === "child_safety"}
              onChange={() => setEscalateKind("child_safety")}
            />
            Child safety (hides the item for everyone, for good)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="escalate"
              checked={escalateKind === "trafficking"}
              onChange={() => setEscalateKind("trafficking")}
            />
            Trafficking or coercion
          </label>
        </fieldset>
      )}
      {outcome && (
        <>
          <Textarea
            aria-label="Note for the log"
            placeholder={`Note for the log, at least ${SAFETY_NOTE_MIN} characters`}
            value={note}
            onChange={event => setNote(event.target.value)}
          />
          <Button
            type="button"
            disabled={!ready || decide.isPending || escalate.isPending}
            onClick={() => void submit()}
          >
            {outcome === "escalate" ? "Escalate" : "Save decision"}
          </Button>
        </>
      )}
      <p className="text-prism-meta text-prism-ink-2">
        Keys: C, L, A, R, E. J and K move between cases.
      </p>
    </section>
  );
}

function DeliveryLine({
  id,
  data,
  lead,
  onRetried,
}: {
  id: string;
  data: CaseView;
  lead: boolean;
  onRetried: () => void;
}) {
  const retry = useMutation(trpc.safety.case.retryDelivery.mutationOptions());
  const delivery = data.delivery!;
  const pending = delivery.dirtySince !== null;
  return (
    <section
      aria-label="Delivery"
      className="prism-slab flex flex-wrap items-center gap-2 p-[13px] text-prism-meta"
    >
      <ShieldCheck aria-hidden className="h-4 w-4 text-prism-ink-2" />
      <span className="flex-1 text-prism-ink">
        {pending
          ? `Stopping delivery, ${delivery.attempts} ${delivery.attempts === 1 ? "retry" : "retries"}`
          : `Delivery: ${delivery.state.toLowerCase()}`}
      </span>
      {pending && lead && (
        <Button
          type="button"
          variant="outline"
          disabled={retry.isPending}
          onClick={async () => {
            try {
              await retry.mutateAsync({ id });
              onRetried();
            } catch (error) {
              toast.error(errorMessage(error));
            }
          }}
        >
          Retry now
        </Button>
      )}
    </section>
  );
}

function Log({ data }: { data: CaseView }) {
  return (
    <SlabTable label="Case log">
      <SlabHead>
        <th className={cn(thClass, stickyCell)}>When</th>
        <th className={thClass}>Action</th>
        <th className={thClass}>Note</th>
      </SlabHead>
      <tbody>
        {data.events.map((event, i) => (
          <tr key={i} className={rowClass}>
            <td className={cn(tdClass, stickyCell)}>{formatDayTime(event.createdAt)}</td>
            <td className={tdClass}>{event.action.replace(/_/g, " ")}</td>
            <td className={tdClass}>{event.note ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </SlabTable>
  );
}

// ----------------------------------------------------------------------------
// Blocked files (board ad6b)
// ----------------------------------------------------------------------------

function BlockedFiles({ lead }: { lead: boolean }) {
  const [search, setSearch] = useState("");
  const query = useMemo(() => search.trim(), [search]);
  const client = useQueryClient();
  const list = useQuery(trpc.safety.blocklist.list.queryOptions(query ? { search: query } : {}));
  const unblock = useMutation(trpc.safety.blocklist.unblock.mutationOptions());

  return (
    <div className="space-y-[13px]">
      <input
        type="search"
        aria-label="Search by hash or case"
        placeholder="Search by hash or case number"
        value={search}
        onChange={event => setSearch(event.target.value)}
        className="h-touch w-full max-w-[420px] rounded-prism-13 border border-prism-line bg-white px-3 text-prism-body"
      />
      {list.isError ? (
        <ErrorCard
          title="Blocked files did not load"
          cause="Try again."
          retryLabel="Retry"
          onRetry={() => void list.refetch()}
        />
      ) : (
        <SlabTable label="Blocked files">
          <SlabHead>
            <th className={cn(thClass, stickyCell)}>sha256</th>
            <th className={thClass}>Reason</th>
            <th className={thClass}>Case</th>
            <th className={thClass}>Added by</th>
            <th className={thClass}>Added</th>
            <th className={thClass} />
          </SlabHead>
          <tbody>
            {list.data?.items.map(row => (
              <tr key={row.id} className={rowClass}>
                <td className={cn(tdClass, stickyCell, "font-mono")}>{row.sha256}</td>
                <td className={tdClass}>{row.reason}</td>
                <td className={tdClass}>{row.caseNumber ?? "None"}</td>
                <td className={tdClass}>{row.addedBy}</td>
                <td className={tdClass}>{formatDayTime(row.addedAt)}</td>
                <td className={tdClass}>
                  {row.removedAt ? (
                    <span className="text-prism-ink-2">
                      Unblocked {formatDayTime(row.removedAt)}
                    </span>
                  ) : lead && row.reason !== "csam" ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={unblock.isPending}
                      onClick={async () => {
                        const reason = window.prompt(
                          "Why unblock this file? At least 10 characters."
                        );
                        if (!reason || reason.trim().length < SAFETY_NOTE_MIN) return;
                        try {
                          await unblock.mutateAsync({ id: row.id, reason });
                          void client.invalidateQueries({
                            queryKey: trpc.safety.blocklist.list.queryKey(),
                          });
                        } catch (error) {
                          toast.error(errorMessage(error));
                        }
                      }}
                    >
                      Unblock
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </SlabTable>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Requests (boards ad3 and ad3b, R3)
// ----------------------------------------------------------------------------

const KIND_LABEL = {
  ncii: "Take It Down",
  copyright: "Copyright",
  counter: "Counter notice",
} as const;

function Requests({ lead }: { lead: boolean }) {
  const [kind, setKind] = useState<"" | "ncii" | "copyright" | "counter">("");
  const [open, setOpen] = useState<string | null>(null);
  const list = useQuery(trpc.safety.requests.list.queryOptions(kind ? { kind } : {}));
  if (open) return <RequestView number={open} lead={lead} onClose={() => setOpen(null)} />;
  return (
    <div className="space-y-[13px]">
      <label className="flex items-center gap-2 text-prism-meta text-prism-ink-2">
        Kind
        <select
          value={kind}
          onChange={event => setKind(event.target.value as typeof kind)}
          className="h-touch rounded-prism-13 border border-prism-line bg-white px-3 text-prism-body text-prism-ink"
        >
          <option value="">All</option>
          <option value="ncii">Take It Down</option>
          <option value="copyright">Copyright</option>
          <option value="counter">Counter notices</option>
        </select>
      </label>
      <SlabTable label="Requests">
        <SlabHead>
          <th className={cn(thClass, stickyCell)}>Number</th>
          <th className={thClass}>Kind</th>
          <th className={thClass}>Received</th>
          <th className={thClass}>Clock</th>
          <th className={thClass}>Items</th>
        </SlabHead>
        <tbody>
          {list.data?.map(row => (
            <tr
              key={row.number}
              className={cn(rowClass, "cursor-pointer")}
              onClick={() => setOpen(row.number)}
            >
              <td className={cn(tdClass, stickyCell, "font-semibold")}>
                <button type="button" onClick={() => setOpen(row.number)}>
                  {row.number}
                </button>
              </td>
              <td className={tdClass}>
                {KIND_LABEL[row.kind as keyof typeof KIND_LABEL] ?? row.kind}
              </td>
              <td className={tdClass}>{formatDayTime(row.receivedAt)}</td>
              <td className={cn(tdClass, row.hoursLeft < 12 && "font-semibold text-prism-danger")}>
                {row.hoursLeft >= 0 ? `${row.hoursLeft} h left` : `${-row.hoursLeft} h over`}
              </td>
              <td className={tdClass}>{formatCount(row.items)}</td>
            </tr>
          ))}
          {list.data?.length === 0 && (
            <tr className={rowClass}>
              <td colSpan={5} className={cn(tdClass, "text-prism-ink-2")}>
                No open requests.
              </td>
            </tr>
          )}
        </tbody>
      </SlabTable>
    </div>
  );
}

function RequestView({
  number,
  lead,
  onClose,
}: {
  number: string;
  lead: boolean;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const view = useQuery(trpc.safety.requests.get.queryOptions({ number }));
  const reveal = useMutation(trpc.safety.requests.revealContact.mutationOptions());
  const decide = useMutation(trpc.safety.requests.decide.mutationOptions());
  const suit = useMutation(trpc.safety.requests.suitFiled.mutationOptions());
  const restore = useMutation(trpc.safety.requests.restore.mutationOptions());
  const [contact, setContact] = useState<Record<string, string | null> | null>(null);
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const refresh = () => {
    void client.invalidateQueries({ queryKey: trpc.safety.requests.get.queryKey({ number }) });
    void client.invalidateQueries({ queryKey: trpc.safety.requests.list.queryKey() });
  };
  const act = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work();
      toast.success(done);
      refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  if (view.isPending)
    return <Skeleton delayMs={400} className="h-[233px] w-full rounded-prism-21" />;
  if (view.isError) {
    return (
      <ErrorCard
        title="This request did not load"
        cause={errorMessage(view.error)}
        retryLabel="Back"
        onRetry={onClose}
      />
    );
  }
  const data = view.data;
  const noteOk = note.trim().length >= SAFETY_NOTE_MIN;
  return (
    <div className="space-y-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          <ArrowLeft aria-hidden />
          Requests
        </Button>
        <h2 className="text-prism-panel-title text-prism-ink">
          {data.number} · {KIND_LABEL[data.kind as keyof typeof KIND_LABEL] ?? data.kind}
        </h2>
        {data.flagged && <WordBadge tone="warning">Many requests against this creator</WordBadge>}
      </div>
      <section className="prism-slab space-y-1 p-[13px] text-prism-meta text-prism-ink">
        <p>
          Received {formatDayTime(data.receivedAt)}, due {formatDayTime(data.dueAt)}
        </p>
        {data.work && <p>Claimed work: {data.work}</p>}
        {data.statement && <p className="whitespace-pre-wrap">Statement: {data.statement}</p>}
        <p>
          Contact:{" "}
          {contact
            ? [contact.name, contact.email, contact.phone, contact.postalAddress]
                .filter(Boolean)
                .join(", ")
            : data.email}
        </p>
        {lead && !contact && (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              act(async () => setContact(await reveal.mutateAsync({ number })), "Shown and logged")
            }
          >
            Show contact
          </Button>
        )}
        {data.restoreFrom && data.restoreBy && (
          <p>
            Restore between {formatDayTime(data.restoreFrom)} and {formatDayTime(data.restoreBy)}
          </p>
        )}
        <ul className="pt-1">
          {data.items.map(item => (
            <li key={item.publicId}>
              {item.publicId}: {item.hidden ? "hidden" : "visible"}
            </li>
          ))}
          {data.copies.map(copy => (
            <li key={copy.publicId}>
              Copy {copy.publicId}: {copy.hidden ? "hidden" : "visible"}
            </li>
          ))}
        </ul>
      </section>
      {!data.closedAt && (
        <section className="prism-slab space-y-[13px] p-[13px]">
          <Textarea
            aria-label="Note for the log"
            placeholder={`Note for the log, at least ${SAFETY_NOTE_MIN} characters`}
            value={note}
            onChange={event => setNote(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {data.kind !== "counter" ? (
              <>
                <Button
                  type="button"
                  disabled={!noteOk || decide.isPending}
                  onClick={() =>
                    act(() => decide.mutateAsync({ number, outcome: "removed", note }), "Removed")
                  }
                >
                  {data.kind === "ncii" ? "Remove all" : "Disable"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!noteOk || decide.isPending}
                  onClick={() =>
                    act(
                      () => decide.mutateAsync({ number, outcome: "not_valid", note }),
                      "Closed as not valid"
                    )
                  }
                >
                  Not valid
                </Button>
              </>
            ) : (
              <>
                <input
                  aria-label="Court and case number"
                  placeholder="Court and case number"
                  value={reference}
                  onChange={event => setReference(event.target.value)}
                  className="h-touch rounded-prism-13 border border-prism-line px-3"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={reference.trim().length < 3 || suit.isPending}
                  onClick={() => act(() => suit.mutateAsync({ number, reference }), "Kept hidden")}
                >
                  Claimant filed suit
                </Button>
                {lead && (
                  <Button
                    type="button"
                    disabled={restore.isPending}
                    onClick={() => act(() => restore.mutateAsync({ number }), "Restored")}
                  >
                    Restore
                  </Button>
                )}
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
