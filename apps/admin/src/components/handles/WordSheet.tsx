import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  ChipGroup,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorCard,
  Input,
  Skeleton,
  Textarea,
  trpc,
  trpcClient,
} from "@repo/ui";
import { FieldError, Spinner, undoToast } from "../../kit/parts";
import { formatDay, formatDayTime } from "../../kit/format";
import { AssignSheet } from "./AssignSheet";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  PrefixTag,
  StatusBadge,
  TierBadge,
  causeOf,
  daysUntil,
  describeLog,
  shortDay,
  type Category,
  type WordDetail,
  type WordRow,
} from "./shared";

// Word sheet (spec 7.4, boards RA4, RA4b, RA4c, RA4e). Admin tier words can be
// edited, assigned, unassigned and released; system words explain where they
// live and list the accounts on notice. Release is the one danger action.

const SYSTEM_FILE = "packages/constants/src/reservedHandles.ts";

function DetailRows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="prism-slab divide-y divide-prism-line">
      {rows.map(([label, value], index) => (
        <div
          key={`${label}-${index}`}
          className="grid min-h-touch grid-cols-[89px_1fr] items-center gap-3 px-4 py-2"
        >
          <dt className="text-prism-meta text-prism-ink-2">{label}</dt>
          <dd className="min-w-0 break-words text-prism-label text-prism-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function addedBy(word: WordDetail) {
  if (word.tier === "system") return "Code";
  const who = word.addedBy?.handle ? `@${word.addedBy.handle}` : "Migration";
  return `${who}, ${formatDay(word.addedAt)}`;
}

export function WordSheet({
  row,
  onClose,
  onChanged,
}: {
  row: WordRow | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const open = !!row;
  const input = row?.id ? { id: row.id } : { word: row?.word ?? "" };
  const detail = useQuery({
    ...trpc.admin.handles.get.queryOptions(input),
    enabled: open,
  });
  const [mode, setMode] = useState<"view" | "edit" | "release" | "unassign">("view");
  const [assigning, setAssigning] = useState(false);
  const [category, setCategory] = useState<Category>("BRAND");
  const [endsOn, setEndsOn] = useState("");
  const [reason, setReason] = useState("");
  const [startNotice, setStartNotice] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string>();

  useEffect(() => {
    setMode("view");
    setTouched(false);
    setServerError(undefined);
  }, [row]);

  const word = detail.data;
  const isSystem = row?.tier === "system";

  const begin = (next: "edit" | "release" | "unassign") => {
    setTouched(false);
    setServerError(undefined);
    setStartNotice(false);
    if (next === "edit" && word) {
      setCategory((word.category ?? "BRAND") as Category);
      setEndsOn(word.expiresAt ? new Date(word.expiresAt).toISOString().slice(0, 10) : "");
      setReason(word.reason ?? "");
    } else {
      setReason("");
    }
    setMode(next);
  };

  const refresh = () => {
    onChanged();
    void detail.refetch();
  };

  const run = async (work: () => Promise<void>) => {
    setTouched(true);
    if (!reason.trim()) return;
    setBusy(true);
    setServerError(undefined);
    try {
      await work();
    } catch (error) {
      setServerError(causeOf(error));
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = () =>
    run(async () => {
      if (!word?.id) return;
      if (category === "HOLD" && !endsOn) {
        setServerError("A hold needs an end date.");
        return;
      }
      const showEnds = category === "HOLD" || category === "BRAND" || category === "PARTNER";
      await trpcClient.admin.handles.update.mutate({
        id: word.id,
        category,
        reason: reason.trim(),
        expiresAt: showEnds && endsOn ? new Date(`${endsOn}T23:59:59`) : null,
      });
      toast.success(`Saved ${word.word}.`);
      setMode("view");
      refresh();
    });

  const release = () =>
    run(async () => {
      if (!word?.id) return;
      const result = await trpcClient.admin.handles.release.mutate({
        id: word.id,
        reason: reason.trim(),
      });
      onClose();
      onChanged();
      undoToast(`Released ${word.word}. Anyone can claim it again.`, () => {
        void trpcClient.admin.handles.restore
          .mutate({ auditId: result.auditId })
          .then(() => {
            toast.success(`${word.word} is reserved again.`);
            onChanged();
          })
          .catch(error => toast.error(causeOf(error)));
      });
    });

  const unassign = () =>
    run(async () => {
      if (!word?.id) return;
      await trpcClient.admin.handles.unassign.mutate({
        id: word.id,
        reason: reason.trim(),
        startNotice,
      });
      toast.success(`Unassigned ${word.word}.`);
      setMode("view");
      refresh();
    });

  const holder = word?.assignedTo?.handle ?? null;
  const reasonField = (helper: string, placeholder?: string) => (
    <Textarea
      label="Reason"
      value={reason}
      rows={2}
      maxLength={500}
      placeholder={placeholder}
      onChange={event => setReason(event.target.value)}
      helper={helper}
      error={touched && !reason.trim() ? "Add a reason. It is saved to the log." : undefined}
    />
  );

  return (
    <>
      <Dialog open={open && !assigning} onOpenChange={next => !next && !busy && onClose()}>
        <DialogContent>
          {!word ? (
            <>
              <DialogHeader>
                <DialogTitle>{row?.word}</DialogTitle>
              </DialogHeader>
              {detail.isError ? (
                <ErrorCard
                  title="This word did not load"
                  cause="The server did not answer. Check your connection, then try again."
                  retryLabel="Retry"
                  onRetry={() => void detail.refetch()}
                />
              ) : (
                <div className="space-y-2" aria-busy>
                  <Skeleton delayMs={400} className="h-touch w-full" />
                  <Skeleton delayMs={400} className="h-touch w-full" />
                </div>
              )}
            </>
          ) : mode === "release" ? (
            <>
              <DialogHeader>
                <DialogTitle>Release {word.word}?</DialogTitle>
                <DialogDescription>
                  {holder
                    ? `@${holder} keeps amped.bio/${word.word} as an ordinary handle. No one else can claim it while they hold it.`
                    : `Anyone can claim amped.bio/${word.word} again.`}
                  {word.notices.some(n => n.state !== "EXEMPT")
                    ? " Open notices for this word close, and those accounts keep their handle."
                    : ""}
                </DialogDescription>
              </DialogHeader>
              {reasonField("Saved to the log.", "Why is this word free again?")}
              <FieldError>{serverError}</FieldError>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setMode("view")} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void release()}
                  disabled={busy}
                  aria-busy={busy || undefined}
                >
                  Release {word.word}
                </Button>
              </DialogFooter>
            </>
          ) : mode === "unassign" ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  Unassign {word.word} from @{holder}?
                </DialogTitle>
                <DialogDescription>
                  {word.word} stays reserved. Choose what happens to @{holder}.
                </DialogDescription>
              </DialogHeader>
              <ChipGroup
                label={`What happens to @${holder}`}
                value={startNotice ? "notice" : "keep"}
                onChange={value => setStartNotice(value === "notice")}
                options={[
                  { value: "keep", label: "Keep the handle" },
                  { value: "notice", label: "Start 14 day notice" },
                ]}
                className="flex-wrap"
              />
              <p className="text-prism-meta text-prism-ink-2">
                {startNotice
                  ? `@${holder} gets an email today and moves to a new link on ${shortDay(new Date(Date.now() + 14 * 86_400_000))} if they do not choose one.`
                  : `@${holder} keeps amped.bio/${word.word} and shows as Exempt in Holders.`}
              </p>
              {reasonField("Saved to the log.")}
              <FieldError>{serverError}</FieldError>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setMode("view")} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void unassign()}
                  disabled={busy}
                  aria-busy={busy || undefined}
                >
                  Unassign {word.word}
                </Button>
              </DialogFooter>
            </>
          ) : mode === "edit" ? (
            <>
              <DialogHeader>
                <DialogTitle>Edit {word.word}</DialogTitle>
                <DialogDescription>
                  The word and its match cannot change. Release it and reserve it again instead.
                </DialogDescription>
              </DialogHeader>
              <form
                noValidate
                className="space-y-5"
                onSubmit={event => {
                  event.preventDefault();
                  void saveEdit();
                }}
              >
                <fieldset className="space-y-2">
                  <legend className="font-prism text-prism-label font-semibold text-prism-ink">
                    Category
                  </legend>
                  <ChipGroup
                    label="Category"
                    value={category}
                    onChange={setCategory}
                    options={CATEGORIES.map(value => ({ value, label: CATEGORY_LABELS[value] }))}
                    className="flex-wrap"
                  />
                </fieldset>
                {(category === "HOLD" || category === "BRAND" || category === "PARTNER") && (
                  <Input
                    label={category === "HOLD" ? "Ends on" : "Ends on (optional)"}
                    type="date"
                    value={endsOn}
                    onChange={event => setEndsOn(event.target.value)}
                  />
                )}
                {reasonField("Internal. Saved to the log. Never shown to users.")}
                <FieldError>{serverError}</FieldError>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setMode("view")}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy} aria-busy={busy || undefined}>
                    Save changes
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {word.word}
                  {word.kind === "PREFIX" && <PrefixTag />}
                </DialogTitle>
                {isSystem && (
                  <DialogDescription>
                    Route and infrastructure word. No account can hold it, because amped.bio/
                    {word.word} is a page. Change it in code.
                  </DialogDescription>
                )}
              </DialogHeader>
              <div className="flex flex-wrap gap-2">
                <TierBadge row={word} />
                <StatusBadge row={word} />
              </div>
              <DetailRows
                rows={[
                  ...(isSystem
                    ? ([
                        [
                          "Lives in",
                          <span key="file" className="font-prism-mono text-prism-code-sm">
                            {SYSTEM_FILE}
                          </span>,
                        ],
                      ] as [string, React.ReactNode][])
                    : ([
                        ["Holder", holder ? `@${holder}` : "None"],
                        ["Match", word.kind === "PREFIX" ? "Starts with" : "Exact word"],
                        ["Reason", word.reason],
                        ["Added", addedBy(word)],
                        ...(word.expiresAt
                          ? ([["Ends", formatDay(word.expiresAt)]] as [string, React.ReactNode][])
                          : []),
                      ] as [string, React.ReactNode][])),
                ]}
              />
              {word.notices.length > 0 && (
                <section aria-label="Accounts on notice" className="space-y-2">
                  <p className="text-prism-label font-semibold text-prism-ink">
                    Accounts on notice
                  </p>
                  <ul className="prism-slab divide-y divide-prism-line">
                    {word.notices.map(notice => (
                      <li key={notice.id} className="px-4 py-2">
                        <p className="text-prism-label font-semibold text-prism-ink">
                          @{notice.user.handle ?? notice.oldHandle}
                        </p>
                        <p className="text-prism-meta text-prism-ink-2">
                          {notice.state === "EXEMPT"
                            ? "Exempt"
                            : notice.state === "FAILED"
                              ? "Failed. Open Holders to retry."
                              : `Renames ${shortDay(notice.deadline)}, in ${daysUntil(notice.deadline)} days`}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {word.log.length > 0 && (
                <section aria-label="Recent" className="space-y-2">
                  <p className="text-prism-label font-semibold text-prism-ink">Recent</p>
                  <ul className="space-y-1">
                    {word.log.map(entry => (
                      <li key={entry.id} className="text-prism-meta text-prism-ink-2">
                        {formatDayTime(entry.createdAt)}, {describeLog(entry)}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <DialogFooter>
                {isSystem ? (
                  <Button variant="secondary" onClick={onClose}>
                    Close
                  </Button>
                ) : (
                  <>
                    <Button variant="secondary" onClick={() => begin("edit")}>
                      Edit
                    </Button>
                    {word.kind === "EXACT" &&
                      (holder ? (
                        <Button variant="secondary" onClick={() => begin("unassign")}>
                          Unassign
                        </Button>
                      ) : (
                        <Button variant="secondary" onClick={() => setAssigning(true)}>
                          Assign
                        </Button>
                      ))}
                    <Button variant="destructive" onClick={() => begin("release")}>
                      Release {word.word}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
          {busy && mode === "view" && <Spinner />}
        </DialogContent>
      </Dialog>
      <AssignSheet
        open={assigning}
        onOpenChange={next => setAssigning(next)}
        word={word?.id ? { id: word.id, word: word.word } : null}
        onAssigned={refresh}
      />
    </>
  );
}
