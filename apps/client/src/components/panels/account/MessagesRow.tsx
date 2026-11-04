import { useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MESSAGE_RULE_HELPERS,
  MESSAGE_RULE_KINDS,
  MESSAGE_RULE_LABELS,
  MESSAGE_UI,
  TESTNET_NOTICE,
  type MessageRuleKind,
} from "@repo/constants";
import { Button, ErrorCard, Notice, Switch, cn, trpc, trpcClient } from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { DisclosureRow } from "../design/kit/DisclosureRow";
import { FieldError } from "../page/blocks/LinkFields";
import { wellClass } from "../page/blocks/linkValue";
import { PersonAvatar } from "../inbox/parts";
import { disablePush, enablePush, needsIosInstall, pushState, type PushState } from "../inbox/push";
import { errorMessage } from "../inbox/util";

/**
 * Account, Messages (Amped Messages PR M5, spec 8.3, board m5): who can message me (the
 * rule tiles plus No one, with the stake amount for the stake rule), the Requests
 * explainer, read receipts, push on this device, email reminders and blocked accounts.
 * Emails link here with ?open=messages.
 */
export const MESSAGES_ROW = "messages";
const S = MESSAGE_UI.settings;

export function MessagesRow() {
  const settings = useQuery(trpc.messages.settings.get.queryOptions());
  const summary = settings.data ? MESSAGE_RULE_LABELS[settings.data.ruleKind] : undefined;
  return (
    <DisclosureRow
      id={MESSAGES_ROW}
      label={S.row}
      warning={settings.isError}
      value={settings.isError ? "Unknown" : (summary ?? "")}
    >
      {settings.isError ? (
        <ErrorCard
          title={S.loadError}
          cause={MESSAGE_UI.listErrorCause}
          onRetry={() => void settings.refetch()}
        />
      ) : settings.data ? (
        <div className="space-y-[34px]">
          <WhoCanMessage
            value={settings.data.ruleKind}
            stakeMin={settings.data.stakeMin}
            hasPool={settings.data.hasPool}
            readReceipts={settings.data.readReceipts}
          />
          <section aria-labelledby="msg-requests" className="space-y-2">
            <h3 id="msg-requests" className="text-prism-label font-bold text-prism-ink">
              {S.requestsTitle}
            </h3>
            <p className="text-prism-meta text-prism-ink-2">{S.requestsBody}</p>
          </section>
          <Receipts
            ruleKind={settings.data.ruleKind}
            stakeMin={settings.data.stakeMin}
            checked={settings.data.readReceipts}
          />
          <NotificationSettings />
          <BlockedAccounts />
        </div>
      ) : null}
    </DisclosureRow>
  );
}

function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      ruleKind: MessageRuleKind;
      stakeMin?: string | null;
      readReceipts?: boolean;
    }) =>
      trpcClient.messages.settings.set.mutate({
        ...input,
        ruleKind: input.ruleKind as Exclude<MessageRuleKind, "PAID_MEMBER">,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.messages.settings.get.pathKey() });
      toast.add({ type: "success", title: S.saved });
    },
    onError: error =>
      toast.add({ type: "error", title: errorMessage(error, MESSAGE_UI.saveFailed) }),
  });
}

function WhoCanMessage({
  value,
  stakeMin,
  hasPool,
}: {
  value: MessageRuleKind;
  stakeMin: string | null;
  hasPool: boolean;
  readReceipts: boolean;
}) {
  const save = useSaveSettings();
  const name = useId();
  const stakeId = useId();
  const [kind, setKind] = useState(value);
  const [amount, setAmount] = useState(stakeMin ?? "");
  useEffect(() => setKind(value), [value]);
  useEffect(() => setAmount(stakeMin ?? ""), [stakeMin]);
  const stakeValid = /^0*[1-9]\d{0,29}$/.test(amount);
  const dirty = kind !== value || (kind === "STAKE_MIN" && amount !== (stakeMin ?? ""));

  const pick = (next: MessageRuleKind) => {
    setKind(next);
    // Every tile but the stake one saves at once; the stake one waits for its amount
    if (next !== "STAKE_MIN") save.mutate({ ruleKind: next });
  };

  return (
    <section aria-labelledby="msg-who" className="space-y-[13px]">
      <div className="space-y-1">
        <h3 id="msg-who" className="text-prism-label font-bold text-prism-ink">
          {S.whoTitle}
        </h3>
        <p className="text-prism-meta text-prism-ink-2">{S.whoHelp}</p>
      </div>
      <fieldset className="space-y-[13px]" disabled={save.isPending}>
        <legend className="sr-only">{S.whoTitle}</legend>
        {MESSAGE_RULE_KINDS.map(k => {
          const unavailable =
            k === "PAID_MEMBER" || ((k === "POOL_MEMBER" || k === "STAKE_MIN") && !hasPool);
          const note =
            k === "PAID_MEMBER"
              ? S.paidSoon
              : unavailable
                ? S.needsPool
                : k === "FOLLOWER"
                  ? S.followerHelp
                  : MESSAGE_RULE_HELPERS[k];
          const selected = kind === k;
          return (
            <div
              key={k}
              className={cn(
                "rounded-prism-13 p-[13px] transition-shadow duration-prism-hover ease-prism",
                selected ? "bg-prism-nav-tint ring-[1.5px] ring-prism-nav" : "prism-well",
                unavailable && "opacity-60"
              )}
            >
              <label
                className={cn(
                  "flex min-h-touch items-start gap-3 font-prism",
                  unavailable ? "cursor-default" : "cursor-pointer"
                )}
              >
                <input
                  type="radio"
                  name={name}
                  value={k}
                  checked={selected}
                  disabled={unavailable}
                  onChange={() => pick(k)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-prism-nav"
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-prism-label font-semibold text-prism-ink">
                    {MESSAGE_RULE_LABELS[k]}
                    {k === "FOLLOWER" && (
                      <span className="rounded-full bg-prism-nav px-2 py-0.5 text-prism-meta font-semibold text-white">
                        {S.recommended}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-prism-meta text-prism-ink-2">{note}</span>
                </span>
              </label>
              {k === "STAKE_MIN" && selected && (
                <div className="mt-[13px] space-y-2 pl-8">
                  <label htmlFor={stakeId} className="block text-prism-label font-semibold">
                    {S.stakeLabel}
                  </label>
                  <div className={wellClass(!!amount && !stakeValid)}>
                    <input
                      id={stakeId}
                      inputMode="numeric"
                      autoComplete="off"
                      value={amount}
                      onChange={e => setAmount(e.target.value.replace(/\D/g, ""))}
                      maxLength={30}
                      aria-invalid={(!!amount && !stakeValid) || undefined}
                      aria-describedby={`${stakeId}-testnet`}
                      className="min-w-0 flex-1 bg-transparent text-prism-label tabular-nums text-prism-ink outline-none"
                    />
                    <span className="shrink-0 text-prism-meta font-semibold text-prism-ink-2">
                      {S.stakeUnit}
                    </span>
                  </div>
                  {!!amount && !stakeValid && (
                    <FieldError id={`${stakeId}-error`}>{S.stakeError}</FieldError>
                  )}
                  <p id={`${stakeId}-testnet`} className="text-prism-meta text-prism-ink-2">
                    {TESTNET_NOTICE}
                  </p>
                  <Button
                    disabled={!stakeValid || !dirty || save.isPending}
                    onClick={() => save.mutate({ ruleKind: "STAKE_MIN", stakeMin: amount })}
                  >
                    {S.save}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </fieldset>
    </section>
  );
}

function Receipts({
  ruleKind,
  stakeMin,
  checked,
}: {
  ruleKind: MessageRuleKind;
  stakeMin: string | null;
  checked: boolean;
}) {
  const save = useSaveSettings();
  const on = save.isPending ? !!save.variables?.readReceipts : checked;
  return (
    <section aria-labelledby="msg-receipts">
      <h3 id="msg-receipts" className="sr-only">
        {S.receipts}
      </h3>
      <Switch
        checked={on}
        disabled={save.isPending}
        onChange={next => save.mutate({ ruleKind, stakeMin, readReceipts: next })}
        label={S.receipts}
        description={S.receiptsHelp}
      />
    </section>
  );
}

function NotificationSettings() {
  const queryClient = useQueryClient();
  const prefs = useQuery(trpc.notifications.messagePrefs.queryOptions());
  const [device, setDevice] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    void pushState()
      .then(setDevice)
      .catch(() => setDevice("unsupported"));
  }, []);
  const setEmail = useMutation({
    mutationFn: (email: boolean) => trpcClient.notifications.setMessagePrefs.mutate({ email }),
    onSuccess: next => queryClient.setQueryData(trpc.notifications.messagePrefs.queryKey(), next),
    onError: () => toast.add({ type: "error", title: MESSAGE_UI.saveFailed }),
  });
  const P = MESSAGE_UI.push;
  const ios = needsIosInstall();

  const togglePush = async (next: boolean) => {
    setBusy(true);
    setNote(null);
    try {
      const state = next ? await enablePush() : await disablePush();
      setDevice(state);
      if (state === "blocked") setNote(P.blocked);
      if (state === "unsupported") setNote(P.unsupported);
      void queryClient.invalidateQueries({ queryKey: trpc.notifications.messagePrefs.pathKey() });
    } catch {
      setNote(MESSAGE_UI.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="msg-notifications" className="space-y-[13px]">
      <h3 id="msg-notifications" className="text-prism-label font-bold text-prism-ink">
        {S.notifications}
      </h3>
      {ios ? (
        <Notice>{P.iosHint}</Notice>
      ) : (
        <Switch
          checked={device === "on"}
          disabled={busy || device === null || device === "unsupported"}
          onChange={next => void togglePush(next)}
          label={S.pushLabel}
          description={device === "unsupported" ? P.unsupported : S.pushHelp}
        />
      )}
      {note && <Notice variant="warning">{note}</Notice>}
      <Switch
        checked={setEmail.isPending ? !!setEmail.variables : (prefs.data?.email ?? true)}
        disabled={prefs.isLoading || setEmail.isPending}
        onChange={next => setEmail.mutate(next)}
        label={S.emailLabel}
        description={S.emailHelp}
      />
    </section>
  );
}

function BlockedAccounts() {
  const queryClient = useQueryClient();
  const blocked = useQuery(trpc.messages.blocked.queryOptions());
  const unblock = useMutation({
    mutationFn: (conversationId: string) => trpcClient.messages.unblock.mutate({ conversationId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.messages.blocked.pathKey() });
      void queryClient.invalidateQueries({ queryKey: trpc.messages.list.pathKey() });
    },
    onError: () => toast.add({ type: "error", title: MESSAGE_UI.saveFailed }),
  });
  const rows = blocked.data ?? [];
  return (
    <section aria-labelledby="msg-blocked" className="space-y-[13px]">
      <h3 id="msg-blocked" className="text-prism-label font-bold text-prism-ink">
        {S.blockedTitle}
      </h3>
      {blocked.isError ? (
        <ErrorCard title={S.loadError} onRetry={() => void blocked.refetch()} />
      ) : rows.length === 0 ? (
        <p className="text-prism-body text-prism-ink-2">
          {blocked.isLoading ? "" : S.blockedEmpty}
        </p>
      ) : (
        <ul className="divide-y divide-prism-line">
          {rows.map(r => (
            <li key={r.conversationId} className="flex min-h-commit items-center gap-3 py-2">
              <PersonAvatar person={r.person} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-prism-label font-semibold text-prism-ink">
                  {r.person.name}
                </span>
                {r.person.handle && (
                  <span className="block truncate text-prism-meta text-prism-ink-2">
                    @{r.person.handle}
                  </span>
                )}
              </span>
              <Button
                variant="secondary"
                onClick={() => unblock.mutate(r.conversationId)}
                disabled={unblock.isPending}
                aria-label={`${S.unblock} ${r.person.name}`}
              >
                {S.unblock}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
