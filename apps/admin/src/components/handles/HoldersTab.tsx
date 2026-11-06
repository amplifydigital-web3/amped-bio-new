import { useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { MoreHorizontal, UserCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorCard,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Textarea,
  cn,
  trpc,
  trpcClient,
} from "@repo/ui";
import { FieldError, FilterChips } from "../../kit/parts";
import { SlabSkeletonRows, rowClass, stickyCell, tdClass, thClass } from "../../kit/Slab";
import { WordBadge, type BadgeTone } from "../../kit/WordBadge";
import { formatCount } from "../../kit/format";
import { causeOf, daysUntil, pageLine, shortDay, type HolderRow } from "./shared";

// Holders tab (spec 7.6, boards RA6, RA6m). The notice flow as a queue. State is
// a word badge; one action shows on the row, the rest sit in the row menu, and
// Rename now always sits in the menu. On phone the row opens a sheet.

type StateFilter = "open" | "notice_sent" | "exempt" | "chose_new" | "renamed" | "failed";
type Action = "extend" | "resend" | "exempt" | "renameNow" | "startNotice" | "retry";

const FILTERS: { value: StateFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "notice_sent", label: "Notice sent" },
  { value: "exempt", label: "Exempt" },
  { value: "chose_new", label: "Chose new" },
  { value: "renamed", label: "Renamed" },
  { value: "failed", label: "Failed" },
];

const STATE: Record<string, { label: string; tone: BadgeTone }> = {
  NOTICE_SENT: { label: "Notice sent", tone: "warning" },
  EXEMPT: { label: "Exempt", tone: "ink" },
  CHOSE_NEW: { label: "Chose new", tone: "success" },
  RENAMED: { label: "Renamed", tone: "ink" },
  FAILED: { label: "Failed", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "ink" },
};

const ACTIONS: Record<Action, { label: string; title: (h: string) => string; body: string }> = {
  extend: {
    label: "Extend 7 days",
    title: h => `Give @${h} 7 more days?`,
    body: "The deadline moves 7 days later. A notice can be extended twice.",
  },
  resend: {
    label: "Resend email",
    title: h => `Send the notice to @${h} again?`,
    body: "The account keeps the deadline it was told. A deadline already past gets 7 more days.",
  },
  exempt: {
    label: "Exempt",
    title: h => `Let @${h} keep the handle?`,
    body: "The notice closes and the account keeps its handle. It shows as Exempt.",
  },
  renameNow: {
    label: "Rename now",
    title: h => `Rename @${h} now?`,
    body: "The account moves to a new link made from its handle today. The old link sends visitors to the new one for 90 days.",
  },
  startNotice: {
    label: "Start notice",
    title: h => `Start a 14 day notice for @${h}?`,
    body: "A published page gets an email today and moves on the deadline if it does not choose a new link. An unpublished page moves now.",
  },
  retry: {
    label: "Retry",
    title: h => `Retry for @${h}?`,
    body: "Sends the email again, or renames again if the deadline already passed.",
  },
};

const DONE: Record<Action, (h: string) => string> = {
  extend: h => `@${h} has 7 more days.`,
  resend: h => `Notice sent to @${h} again.`,
  exempt: h => `@${h} keeps the handle.`,
  renameNow: h => `@${h} moved to a new link.`,
  startNotice: h => `Notice started for @${h}.`,
  retry: h => `Retried for @${h}.`,
};

function primaryAction(row: HolderRow): Action | null {
  switch (row.state) {
    case "NOTICE_SENT":
      return row.canExtend ? "extend" : "resend";
    case "EXEMPT":
      return "startNotice";
    case "FAILED":
      return "retry";
    default:
      return null;
  }
}

function menuActions(row: HolderRow): Action[] {
  const actions: Action[] = [];
  if (row.state === "NOTICE_SENT") {
    actions.push("resend");
    if (row.tier === "ADMIN") actions.push("exempt");
  }
  if (row.state === "FAILED" && row.tier === "ADMIN") actions.push("exempt");
  return actions;
}

function canRename(row: HolderRow) {
  return row.state === "NOTICE_SENT" || row.state === "FAILED" || row.state === "EXEMPT";
}

function deadlineLine(row: HolderRow) {
  if (row.state === "CHOSE_NEW" || row.state === "RENAMED") return `Done, was @${row.oldHandle}`;
  if (row.state === "FAILED")
    return row.deadline && daysUntil(row.deadline) === 0 ? "Rename failed" : "Email failed";
  if (!row.deadline) return "None";
  const days = daysUntil(row.deadline);
  return `${shortDay(row.deadline)}, ${days} ${days === 1 ? "day" : "days"}`;
}

export function HoldersTab({ onOpenRedirects }: { onOpenRedirects: () => void }) {
  const [filter, setFilter] = useState<StateFilter>("open");
  const [pending, setPending] = useState<{ row: HolderRow; action: Action } | null>(null);
  const [sheet, setSheet] = useState<HolderRow | null>(null);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string>();

  const list = useQuery(
    trpc.admin.handles.holders.list.queryOptions({ state: filter, limit: 200 })
  );
  const totals = useQueries({
    queries: FILTERS.map(({ value }) =>
      trpc.admin.handles.holders.list.queryOptions({ state: value, limit: 1 })
    ),
  });

  const refetch = () => {
    void list.refetch();
    totals.forEach(total => void total.refetch());
  };

  const ask = (row: HolderRow, action: Action) => {
    setSheet(null);
    setReason("");
    setTouched(false);
    setServerError(undefined);
    setPending({ row, action });
  };

  const confirm = async () => {
    if (!pending) return;
    setTouched(true);
    if (!reason.trim()) return;
    setBusy(true);
    setServerError(undefined);
    const input = { noticeId: pending.row.id, reason: reason.trim() };
    const handle = pending.row.user.handle ?? pending.row.oldHandle;
    try {
      const procedures = trpcClient.admin.handles.holders;
      if (pending.action === "extend") await procedures.extend.mutate(input);
      if (pending.action === "resend") await procedures.resend.mutate(input);
      if (pending.action === "exempt") await procedures.exempt.mutate(input);
      if (pending.action === "renameNow") await procedures.renameNow.mutate(input);
      if (pending.action === "startNotice") await procedures.startNotice.mutate(input);
      if (pending.action === "retry") await procedures.retry.mutate(input);
      toast.success(DONE[pending.action](handle));
      setPending(null);
      refetch();
    } catch (error) {
      setServerError(causeOf(error));
    } finally {
      setBusy(false);
    }
  };

  const rows = list.data?.items ?? [];

  const rowMenu = (row: HolderRow) => {
    const extra = menuActions(row).filter(action => action !== primaryAction(row));
    if (extra.length === 0 && !canRename(row)) return null;
    return (
      <Menu>
        <MenuTrigger
          aria-label={`More actions for @${row.user.handle ?? row.oldHandle}`}
          className="prism-focus inline-flex h-touch w-touch items-center justify-center rounded-full text-prism-ink-2 hover:bg-prism-nav-tint"
        >
          <MoreHorizontal aria-hidden className="h-5 w-5" />
        </MenuTrigger>
        <MenuContent align="end">
          {extra.map(action => (
            <MenuItem key={action} onSelect={() => ask(row, action)}>
              {ACTIONS[action].label}
            </MenuItem>
          ))}
          {canRename(row) && (
            <>
              {extra.length > 0 && <MenuSeparator />}
              <MenuItem destructive onSelect={() => ask(row, "renameNow")}>
                Rename now
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>
    );
  };

  const primaryButton = (row: HolderRow, className?: string) => {
    const action = primaryAction(row);
    if (row.state === "RENAMED" && row.hasRedirect) {
      return (
        <Button variant="secondary" className={className} onClick={onOpenRedirects}>
          Open redirect
        </Button>
      );
    }
    if (!action) return null;
    return (
      <Button variant="secondary" className={className} onClick={() => ask(row, action)}>
        {ACTIONS[action].label}
      </Button>
    );
  };

  const body = list.isError ? (
    <ErrorCard
      title="Holders did not load"
      cause="The server did not answer. Check your connection, then try again."
      retryLabel="Retry"
      onRetry={refetch}
    />
  ) : !list.isPending && rows.length === 0 ? (
    <div className="prism-slab">
      <EmptyState
        icon={UserCheck}
        title="No accounts on notice"
        description="Accounts that hold a word when it is reserved show here."
      />
    </div>
  ) : (
    <>
      <div className="prism-slab hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table aria-label="Holders" className="w-full min-w-[960px] text-left">
            <thead>
              <tr>
                {["Account", "Word", "Page", "State", "Deadline", "Actions"].map((label, index) => (
                  <th
                    key={label}
                    scope="col"
                    className={cn(
                      thClass,
                      index === 0 && stickyCell,
                      label === "Actions" && "text-right"
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            {list.isPending ? (
              <SlabSkeletonRows columns={6} />
            ) : (
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className={rowClass}>
                    <td className={cn(tdClass, stickyCell)}>
                      <p className="text-prism-label font-semibold text-prism-ink">
                        @{row.user.handle ?? row.oldHandle}
                      </p>
                      <p className="max-w-[189px] truncate text-prism-meta text-prism-ink-2">
                        {row.user.name}
                      </p>
                    </td>
                    <td className={tdClass}>
                      <p className="text-prism-label text-prism-ink">{row.word}</p>
                      <p className="text-prism-meta text-prism-ink-2">
                        {row.tier === "SYSTEM" ? "System" : "Admin word"}
                      </p>
                    </td>
                    <td className={cn(tdClass, "text-prism-meta text-prism-ink")}>
                      {pageLine(row.user)}
                    </td>
                    <td className={tdClass}>
                      <WordBadge tone={STATE[row.state]?.tone ?? "ink"}>
                        {STATE[row.state]?.label ?? row.state}
                      </WordBadge>
                    </td>
                    <td
                      className={cn(
                        tdClass,
                        "whitespace-nowrap text-prism-meta tabular-nums text-prism-ink"
                      )}
                    >
                      {deadlineLine(row)}
                    </td>
                    <td className={cn(tdClass, "whitespace-nowrap text-right")}>
                      <span className="inline-flex items-center gap-1">
                        {primaryButton(row)}
                        {rowMenu(row)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>
      </div>
      <ul aria-label="Holders" className="prism-slab divide-y divide-prism-line md:hidden">
        {list.isPending
          ? Array.from({ length: 4 }).map((_, index) => (
              <li key={index} aria-hidden className="h-14" />
            ))
          : rows.map(row => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setSheet(row)}
                  className="prism-focus flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-prism-label font-semibold text-prism-ink">
                      @{row.user.handle ?? row.oldHandle}
                    </span>
                    <span className="block text-prism-meta text-prism-ink-2">
                      {row.word}, {deadlineLine(row)}
                    </span>
                  </span>
                  <WordBadge tone={STATE[row.state]?.tone ?? "ink"}>
                    {STATE[row.state]?.label ?? row.state}
                  </WordBadge>
                </button>
              </li>
            ))}
      </ul>
    </>
  );

  return (
    <div className="space-y-[13px]">
      <FilterChips
        label="State"
        value={filter}
        onChange={setFilter}
        options={FILTERS.map(({ value, label }, index) => ({
          value,
          label: (
            <>
              {label}{" "}
              {totals[index]?.data && (
                <span className="tabular-nums">{formatCount(totals[index]?.data?.total)}</span>
              )}
            </>
          ),
        }))}
      />
      {body}
      <p className="text-prism-meta text-prism-ink-2">
        Exempt is offered for admin words only. A system word always wins over a page.
      </p>

      {/* Phone row sheet (RA6m) */}
      <Dialog open={!!sheet} onOpenChange={open => !open && setSheet(null)}>
        <DialogContent>
          {sheet && (
            <>
              <DialogHeader>
                <DialogTitle>@{sheet.user.handle ?? sheet.oldHandle}</DialogTitle>
                <DialogDescription>
                  {sheet.word}, {STATE[sheet.state]?.label ?? sheet.state}. {pageLine(sheet.user)}.{" "}
                  {deadlineLine(sheet)}.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                {primaryButton(sheet, "w-full")}
                {menuActions(sheet)
                  .filter(action => action !== primaryAction(sheet))
                  .map(action => (
                    <Button
                      key={action}
                      variant="secondary"
                      className="w-full"
                      onClick={() => ask(sheet, action)}
                    >
                      {ACTIONS[action].label}
                    </Button>
                  ))}
                {canRename(sheet) && (
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => ask(sheet, "renameNow")}
                  >
                    Rename now
                  </Button>
                )}
              </div>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setSheet(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Every holder action asks for a reason, saved to the log */}
      <Dialog open={!!pending} onOpenChange={open => !open && !busy && setPending(null)}>
        <DialogContent>
          {pending && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {ACTIONS[pending.action].title(pending.row.user.handle ?? pending.row.oldHandle)}
                </DialogTitle>
                <DialogDescription>{ACTIONS[pending.action].body}</DialogDescription>
              </DialogHeader>
              <Textarea
                label="Reason"
                value={reason}
                rows={2}
                maxLength={500}
                onChange={event => setReason(event.target.value)}
                helper="Saved to the log."
                error={
                  touched && !reason.trim() ? "Add a reason. It is saved to the log." : undefined
                }
              />
              <FieldError>{serverError}</FieldError>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setPending(null)} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  variant={pending.action === "renameNow" ? "destructive" : "default"}
                  onClick={() => void confirm()}
                  disabled={busy}
                  aria-busy={busy || undefined}
                >
                  {ACTIONS[pending.action].label}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
