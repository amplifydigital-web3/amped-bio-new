import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  trpc,
  trpcClient,
} from "@repo/ui";
import { FieldError, SearchWell, Spinner } from "../../kit/parts";
import { CATEGORY_LABELS, causeOf, type Category } from "./shared";

// Assign a reserved word (spec 7.5, board RA5). From the word sheet the word is
// fixed and the admin finds the account; from the Users slab (Give reserved
// word) the account is fixed and the admin picks an admin tier exact word.

export type AssignAccount = { id: number; handle: string | null; name: string };
export type AssignWord = { id: string; word: string };

export function AssignSheet({
  open,
  onOpenChange,
  word: fixedWord,
  account: fixedAccount,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  word?: AssignWord | null;
  account?: AssignAccount | null;
  onAssigned: () => void;
}) {
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState<AssignAccount | null>(null);
  const [wordId, setWordId] = useState<string>("");
  const [redirectOld, setRedirectOld] = useState(true);
  const [notify, setNotify] = useState(true);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setAccount(fixedAccount ?? null);
    setWordId(fixedWord?.id ?? "");
    setRedirectOld(true);
    setNotify(true);
    setReason("");
    setTouched(false);
    setServerError(undefined);
  }, [open, fixedAccount, fixedWord]);

  const term = query.trim();
  const search = useQuery({
    ...trpc.admin.users.searchUsers.queryOptions({ query: term }),
    enabled: open && !fixedAccount && term.length >= 2,
  });
  const assignable = useQuery({
    ...trpc.admin.handles.assignable.queryOptions(),
    enabled: open && !fixedWord,
  });

  const word =
    fixedWord ?? (assignable.data ?? []).find(candidate => candidate.id === wordId) ?? null;
  const oldHandle = account?.handle ?? null;

  const errors = {
    account: !account ? "Choose an account." : undefined,
    word: !word ? "Choose a reserved word." : undefined,
    reason: !reason.trim() ? "Add a reason. It is saved to the log." : undefined,
  };

  const submit = async () => {
    setTouched(true);
    if (!account || !word || errors.reason) return;
    setBusy(true);
    setServerError(undefined);
    try {
      await trpcClient.admin.handles.assign.mutate({
        id: word.id,
        userId: account.id,
        reason: reason.trim(),
        redirectOld: redirectOld && !!oldHandle,
        notify,
      });
      toast.success(`${account.name} now holds amped.bio/${word.word}.`);
      onAssigned();
      onOpenChange(false);
    } catch (error) {
      setServerError(causeOf(error));
    } finally {
      setBusy(false);
    }
  };

  const title = word ? `Assign ${word.word}` : "Give a reserved word";

  return (
    <Dialog open={open} onOpenChange={next => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            The account moves to amped.bio/{word?.word ?? "word"}. An account holds one handle, so
            its old one is freed.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-5"
          onSubmit={event => {
            event.preventDefault();
            void submit();
          }}
        >
          {!fixedWord && (
            <div className="space-y-2">
              <p className="font-prism text-prism-label font-semibold text-prism-ink">Word</p>
              {assignable.isPending ? (
                <Spinner />
              ) : (assignable.data ?? []).length === 0 ? (
                <p className="text-prism-meta text-prism-ink-2">
                  No reserved word is free to give. Reserve an exact word on the Handles page first.
                </p>
              ) : (
                <Select value={wordId} onValueChange={setWordId}>
                  <SelectTrigger aria-label="Reserved word" className="h-touch">
                    <SelectValue placeholder="Choose a word" />
                  </SelectTrigger>
                  <SelectContent>
                    {(assignable.data ?? []).map(candidate => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.word} ({CATEGORY_LABELS[candidate.category as Category]})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FieldError>{touched ? errors.word : undefined}</FieldError>
            </div>
          )}

          {!fixedAccount && (
            <div className="space-y-2">
              <SearchWell
                label="Account"
                placeholder="Handle, name or email"
                value={query}
                onChange={value => {
                  setQuery(value);
                  setAccount(null);
                }}
              />
              {account ? (
                <p className="text-prism-meta text-prism-ink-2">
                  Chosen: <span className="font-semibold text-prism-ink">{account.name}</span>
                  {account.handle ? ` @${account.handle}` : ""}
                </p>
              ) : term.length >= 2 ? (
                <ul
                  aria-label="Matching accounts"
                  className="prism-slab divide-y divide-prism-line"
                >
                  {search.isPending ? (
                    <li className="flex h-touch items-center px-4">
                      <Spinner />
                    </li>
                  ) : (search.data ?? []).length === 0 ? (
                    <li className="px-4 py-3 text-prism-meta text-prism-ink-2">
                      No account matches {term}.
                    </li>
                  ) : (
                    (search.data ?? []).map(user => (
                      <li key={user.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setAccount({ id: user.id, handle: user.handle, name: user.name })
                          }
                          className="prism-focus flex min-h-touch w-full flex-col justify-center px-4 py-1 text-left hover:bg-prism-nav-tint"
                        >
                          <span className="text-prism-label font-semibold text-prism-ink">
                            {user.name}
                          </span>
                          {user.handle && (
                            <span className="text-prism-meta text-prism-ink-2">@{user.handle}</span>
                          )}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
              <FieldError>{touched ? errors.account : undefined}</FieldError>
            </div>
          )}

          {account && word && (
            <p className="prism-slab px-4 py-3 text-prism-label text-prism-ink">
              {oldHandle ? `@${oldHandle} to @${word.word}` : `${account.name} to @${word.word}`}
            </p>
          )}

          {oldHandle && (
            <Checkbox checked={redirectOld} onCheckedChange={setRedirectOld}>
              Send amped.bio/{oldHandle} to the new link for 90 days
            </Checkbox>
          )}
          <Checkbox
            checked={notify}
            onCheckedChange={setNotify}
            helper={`Your Amped.Bio link is now amped.bio/${word?.word ?? "word"}.`}
          >
            Email the account about the new link
          </Checkbox>
          <Textarea
            label="Reason"
            value={reason}
            rows={2}
            maxLength={500}
            onChange={event => setReason(event.target.value)}
            helper="Internal. Saved to the log."
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
              {word ? `Assign ${word.word}` : "Assign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
