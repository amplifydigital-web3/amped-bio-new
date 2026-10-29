import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
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
  Input,
  Textarea,
  trpcClient,
  type RouterOutputs,
} from "@repo/ui";
import { handlePrefixForm, handleSkeleton, isSystemReservedHandle } from "@repo/constants";
import { FieldError } from "../../kit/parts";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  causeOf,
  defaultAction,
  normalizeWord,
  pageLine,
  shortDay,
  signedInLine,
  wordError,
  WORD_PATTERN,
  type Category,
  type HolderAction,
  type Kind,
  type WordRow,
} from "./shared";

// Reserve a word (spec 7.3, boards RA2, RA2e, RA2f, RA3, RA3b). Two steps in one
// sheet: the form, then the accounts that already hold the word. The collision
// check runs on Continue, so an admin never takes a handle by accident.

type Collisions = RouterOutputs["admin"]["handles"]["checkCollisions"];

const LISTED = 20;
const NOTICE_DAYS = 14;

const ACTION_OPTIONS: { value: HolderAction; label: string }[] = [
  { value: "keep", label: "Keep and exempt" },
  { value: "notice", label: "Start 14 day notice" },
];

function todayPlus(days: number) {
  return new Date(Date.now() + days * 86_400_000);
}

export function ReserveSheet({
  open,
  onOpenChange,
  rows,
  onReserved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Every reserved row, for the as typed "already reserved" check
  rows: WordRow[];
  onReserved: () => void;
}) {
  const [word, setWord] = useState("");
  const [kind, setKind] = useState<Kind>("EXACT");
  const [category, setCategory] = useState<Category>("BRAND");
  const [endsOn, setEndsOn] = useState("");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [step, setStep] = useState<"form" | "holders">("form");
  const [collisions, setCollisions] = useState<Collisions | null>(null);
  const [allAction, setAllAction] = useState<HolderAction>("keep");
  const [actions, setActions] = useState<Record<number, HolderAction>>({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setWord("");
    setKind("EXACT");
    setCategory("BRAND");
    setEndsOn("");
    setReason("");
    setTouched(false);
    setStep("form");
    setCollisions(null);
    setActions({});
    setServerError(undefined);
  }, [open]);

  const normalized = normalizeWord(word);
  const showEnds = category === "HOLD" || category === "BRAND" || category === "PARTNER";

  // Checked as typed against both tiers (RA2e)
  const takenError = useMemo(() => {
    if (!normalized) return undefined;
    if (kind === "EXACT" && isSystemReservedHandle(normalized)) {
      return `${normalized} is a system word, reserved in code.`;
    }
    if (kind === "PREFIX" && normalized.startsWith("_")) {
      return `${normalized} is a system word, reserved in code.`;
    }
    const covered = rows.some(row => {
      if (row.tier === "system") return false;
      if (kind === "EXACT" && row.kind === "EXACT") {
        return handleSkeleton(row.word) === handleSkeleton(normalized);
      }
      if (kind === "PREFIX" && row.kind === "PREFIX") {
        return handlePrefixForm(row.word) === handlePrefixForm(normalized);
      }
      if (kind === "EXACT" && row.kind === "PREFIX") {
        return handlePrefixForm(normalized).startsWith(handlePrefixForm(row.word));
      }
      return false;
    });
    return covered
      ? `${normalized} is already reserved. Open it from the Reserved tab to edit it.`
      : undefined;
  }, [kind, normalized, rows]);

  const errors = {
    word: !normalized ? "Add a word." : (wordError(normalized, kind) ?? takenError),
    endsOn:
      category === "HOLD" && !endsOn
        ? "A hold needs an end date."
        : endsOn && new Date(`${endsOn}T23:59:59`) <= new Date()
          ? "The end date must be in the future."
          : undefined,
    reason: !reason.trim()
      ? "Add a reason. It is saved to the log."
      : reason.trim().length > 500
        ? "Keep the reason under 500 characters."
        : undefined,
  };
  const formValid = !errors.word && !errors.endsOn && !errors.reason;

  const expiresAt = showEnds && endsOn ? new Date(`${endsOn}T23:59:59`) : null;

  const save = async (holders: { userId: number; action: HolderAction }[]) => {
    setBusy(true);
    setServerError(undefined);
    try {
      await trpcClient.admin.handles.reserve.mutate({
        word: normalized,
        kind,
        category,
        reason: reason.trim(),
        expiresAt,
        defaultAction: allAction,
        holders,
      });
      toast.success(`Reserved ${normalized}.`);
      onReserved();
      onOpenChange(false);
    } catch (error) {
      const code = (error as { data?: { code?: string } })?.data?.code;
      if (code === "CONFLICT") {
        // Someone claimed or left the word between Continue and Save: check again
        setServerError("The accounts that hold this word changed. Check them below.");
        await checkCollisions();
      } else {
        setServerError(causeOf(error));
      }
    } finally {
      setBusy(false);
    }
  };

  const checkCollisions = async () => {
    const result = await trpcClient.admin.handles.checkCollisions.query({
      word: normalized,
      kind,
    });
    setCollisions(result);
    const initial = defaultAction(category);
    setAllAction(initial);
    setActions(Object.fromEntries(result.accounts.map(account => [account.id, initial])));
    return result;
  };

  const onContinue = async () => {
    setTouched(true);
    if (!formValid) return;
    setBusy(true);
    setServerError(undefined);
    try {
      const result = await checkCollisions();
      if (result.tooBroad) {
        setServerError(`${normalized} matches more than 200 accounts. Reserve a narrower word.`);
        return;
      }
      if (result.total === 0) {
        setBusy(false);
        await save([]);
        return;
      }
      setStep("holders");
    } catch (error) {
      setServerError(causeOf(error));
    } finally {
      setBusy(false);
    }
  };

  const holdersPayload = () =>
    (collisions?.accounts ?? []).map(account => ({
      userId: account.id,
      action: actions[account.id] ?? allAction,
    }));

  const deadline = shortDay(todayPlus(NOTICE_DAYS));
  const total = collisions?.total ?? 0;
  const unlisted = Math.max(0, total - LISTED);

  return (
    <Dialog open={open} onOpenChange={next => !busy && onOpenChange(next)}>
      <DialogContent>
        {step === "form" ? (
          <>
            <DialogHeader>
              <DialogTitle>Reserve a word</DialogTitle>
            </DialogHeader>
            <form
              noValidate
              className="space-y-5"
              onSubmit={event => {
                event.preventDefault();
                void onContinue();
              }}
            >
              <Input
                label="Word"
                leftText="amped.bio/"
                value={word}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={event => setWord(event.target.value)}
                helper="Lowercase letters, numbers, - and _. At least 2 characters."
                error={
                  touched
                    ? errors.word
                    : normalized && !WORD_PATTERN.test(normalized)
                      ? "Use only a to z, 0 to 9, - and _."
                      : takenError
                }
              />
              <fieldset className="space-y-2">
                <legend className="font-prism text-prism-label font-semibold text-prism-ink">
                  Match
                </legend>
                <ChipGroup
                  label="Match"
                  value={kind}
                  onChange={setKind}
                  options={[
                    { value: "EXACT", label: "Exact word" },
                    { value: "PREFIX", label: "Starts with" },
                  ]}
                  className="flex-wrap"
                />
              </fieldset>
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
              {showEnds && (
                <Input
                  label={category === "HOLD" ? "Ends on" : "Ends on (optional)"}
                  type="date"
                  value={endsOn}
                  min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
                  onChange={event => setEndsOn(event.target.value)}
                  helper={
                    category === "HOLD"
                      ? "A hold frees itself on this day."
                      : "Leave empty for no end date."
                  }
                  error={touched ? errors.endsOn : undefined}
                />
              )}
              <Textarea
                label="Reason"
                value={reason}
                rows={3}
                maxLength={500}
                onChange={event => setReason(event.target.value)}
                helper="Internal. Saved to the log. Never shown to users."
                error={touched ? errors.reason : undefined}
              />
              <FieldError>{serverError}</FieldError>
              <DialogFooter>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onOpenChange(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy} aria-busy={busy || undefined}>
                  Continue
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {total === 1
                  ? `1 account uses ${normalized}`
                  : kind === "PREFIX"
                    ? `${total} accounts start with ${normalized}`
                    : `${total} accounts use ${normalized}`}
              </DialogTitle>
              <DialogDescription>
                {total > LISTED
                  ? `Set one action for all, then change any account below. Accounts past the first ${LISTED} take the action for all.`
                  : "Choose what happens to each account. Taking a handle is a moderation action."}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[55vh] space-y-3 overflow-y-auto">
              {total > LISTED && (
                <fieldset className="prism-slab space-y-2 p-4">
                  <legend className="sr-only">Action for all {total}</legend>
                  <p className="font-prism text-prism-label font-semibold text-prism-ink">
                    Action for all {total}
                  </p>
                  <ChipGroup
                    label={`Action for all ${total}`}
                    value={allAction}
                    onChange={value => {
                      setAllAction(value);
                      setActions(
                        Object.fromEntries(
                          (collisions?.accounts ?? []).map(account => [account.id, value])
                        )
                      );
                    }}
                    options={[
                      { value: "keep", label: "Keep and exempt" },
                      { value: "notice", label: "Start notice" },
                    ]}
                    className="flex-wrap"
                  />
                </fieldset>
              )}
              <ul className="prism-slab divide-y divide-prism-line">
                {(collisions?.accounts ?? []).map(account => {
                  const action = actions[account.id] ?? allAction;
                  const published = account.pageStatus === "PUBLISHED";
                  return (
                    <li key={account.id} className="space-y-2 px-4 py-3">
                      <div>
                        <p className="text-prism-label font-semibold text-prism-ink">
                          @{account.handle}
                        </p>
                        <p className="text-prism-meta text-prism-ink-2">
                          {pageLine(account)}, {signedInLine(account.lastSignInAt)}
                          {account.hasPool ? ", has a pool" : ""}
                        </p>
                      </div>
                      <ChipGroup
                        label={`Action for @${account.handle}`}
                        value={action}
                        onChange={value => setActions(a => ({ ...a, [account.id]: value }))}
                        options={ACTION_OPTIONS}
                        className="flex-wrap"
                      />
                      {action === "notice" && (
                        <p className="flex gap-2 rounded-prism-8 bg-prism-warning-bg px-3 py-2 text-prism-meta text-prism-warning-ink">
                          <AlertTriangle aria-hidden className="mt-px h-4 w-4 shrink-0" />
                          {published
                            ? `@${account.handle} gets an email today. On ${deadline} their page moves to a new link made from their handle if they have not chosen one.`
                            : `@${account.handle} has no published page, so it moves to a new link now, with no email.`}
                        </p>
                      )}
                      {action === "keep" && kind === "EXACT" && (
                        <p className="text-prism-meta text-prism-ink-2">
                          Assigns {normalized} to this account.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              {unlisted > 0 && (
                <p className="text-prism-meta text-prism-ink-2">
                  {unlisted} more {unlisted === 1 ? "account is" : "accounts are"} not listed and
                  take {allAction === "keep" ? "Keep and exempt" : "Start notice"}.
                </p>
              )}
            </div>
            <FieldError>{serverError}</FieldError>
            <DialogFooter>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setServerError(undefined);
                  setStep("form");
                }}
              >
                Back
              </Button>
              <Button
                disabled={busy}
                aria-busy={busy || undefined}
                onClick={() => void save(holdersPayload())}
              >
                Reserve {normalized}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
