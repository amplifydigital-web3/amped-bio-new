import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TELEGRAM_APP_STRINGS as S, TELEGRAM_LIMITS, type DmRuleKind } from "@repo/constants";
import { Button, Checkbox, ErrorCard, Notice, Skeleton, trpc, trpcClient } from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { AUTOSAVE_DELAY_MS } from "@/contexts/EditorContext";
import { FieldError } from "../page/blocks/LinkFields";
import { wellClass } from "../page/blocks/linkValue";
import { RuleTiles, type RuleValue } from "./RuleTiles";
import { errorMessage, stakeMinError } from "./shared";

type Draft = RuleValue & { enabled: boolean; cap: string; replyFromTelegram: boolean };

function capError(cap: string) {
  const n = Number(cap);
  return /^\d+$/.test(cap) && n >= 1 && n <= TELEGRAM_LIMITS.dailyNewThreadCapMax
    ? null
    : S.capError;
}

function Eyebrow({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h3 id={id} className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2">
      <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-nav" />
      {children}
    </h3>
  );
}

/**
 * Inbox, Settings, Fan messages (Screen Review 114, board tg3). One checkbox turns
 * Fan messages on (087 D1: never a switch), five rule tiles, the daily cap on new
 * conversations, and Reply from Telegram. Every valid change autosaves (D11);
 * the checkbox and the tiles save at once, the typed fields 800 ms after the last
 * key. The server checks the same rules and its copy shows when it refuses.
 */
export function FanMessagesSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const settings = useQuery(trpc.messaging.creator.getSettings.queryOptions());
  const [draft, setDraft] = useState<Draft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed the draft once from the server; later reads do not overwrite typing
  useEffect(() => {
    if (draft || !settings.data) return;
    const data = settings.data;
    setDraft({
      enabled: data.enabled,
      ruleKind: data.ruleKind as DmRuleKind,
      stakeMin: data.stakeMin ?? "",
      cap: String(data.dailyNewThreadCap),
      replyFromTelegram: data.replyFromTelegram,
    });
  }, [draft, settings.data]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const save = useMutation({
    mutationFn: (next: Draft) =>
      trpcClient.messaging.creator.setSettings.mutate({
        enabled: next.enabled,
        ruleKind: next.ruleKind,
        stakeMin: next.ruleKind === "STAKE_MIN" ? next.stakeMin : null,
        dailyNewThreadCap: Number(next.cap),
        replyFromTelegram: next.replyFromTelegram,
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: trpc.messaging.creator.getSettings.queryKey(),
      }),
    onError: error => {
      toast.add({ type: "error", title: errorMessage(error, S.settingsFailed) });
      // Back to what the server holds
      void settings.refetch().then(() => setDraft(null));
    },
  });

  const update = (patch: Partial<Draft>, delay = 0) => {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    if (stakeMinError(next) || capError(next.cap)) return;
    // A rule that needs an amount waits for one before it is saved
    timer.current = setTimeout(() => save.mutate(next), delay);
  };

  if (settings.isLoading || (!draft && !settings.isError)) {
    return (
      <div aria-busy className="prism-slab space-y-3 rounded-prism-21 p-5">
        <Skeleton className="h-5 w-40 rounded-full" />
        <Skeleton className="h-24 rounded-prism-13" />
        <Skeleton className="h-24 rounded-prism-13" />
      </div>
    );
  }
  if (settings.isError || !settings.data || !draft) {
    return (
      <ErrorCard
        title={S.settingsFailed}
        cause="Try again in a moment."
        onRetry={() => void settings.refetch()}
      />
    );
  }

  const data = settings.data;
  const req = data.requirements;
  const missing: string[] = [
    !req.telegramLinked || !req.telegramReachable ? S.requirementLink : null,
    !req.emailVerified ? S.requirementEmail : null,
    !req.published ? S.requirementPublish : null,
  ].filter((line): line is NonNullable<typeof line> => !!line);
  const canTurnOn = missing.length === 0 && req.invited && !data.paused;

  return (
    <section
      aria-labelledby="fan-messages-title"
      className="prism-slab space-y-[21px] rounded-prism-21 p-5 font-prism"
    >
      <div className="space-y-2">
        <h2 id="fan-messages-title" className="text-prism-card-title text-prism-ink">
          {S.settingsTitle}
        </h2>
        <p className="text-prism-body text-prism-ink-2">{S.settingsIntro}</p>
      </div>

      {data.paused && <Notice variant="warning">{S.messagingSettingsErrors.paused}</Notice>}
      {!req.invited && <Notice variant="info">{S.messagingSettingsErrors.notInvited}</Notice>}
      {missing.length > 0 && !draft.enabled && (
        <Notice variant="info" title={S.requirementsTitle}>
          <ul className="list-disc space-y-1 pl-5">
            {missing.map(line => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {(!req.telegramLinked || !req.telegramReachable) && (
            <Button
              variant="ghost"
              className="mt-2"
              onClick={() => navigate("/account?open=connected-apps")}
            >
              {S.openAccount}
            </Button>
          )}
        </Notice>
      )}

      <Checkbox
        checked={draft.enabled}
        disabled={save.isPending || (!draft.enabled && !canTurnOn)}
        onCheckedChange={checked => update({ enabled: checked })}
        helper={S.settingsEnable.helper}
      >
        {S.settingsEnable.label}
      </Checkbox>

      <div className="space-y-[13px]">
        <Eyebrow>{S.ruleTitle}</Eyebrow>
        <RuleTiles
          value={draft}
          hasPool={req.hasPool}
          onChange={next => update(next, next.ruleKind === draft.ruleKind ? AUTOSAVE_DELAY_MS : 0)}
          stakeError={draft.stakeMin ? stakeMinError(draft) : null}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="dm-cap" className="block text-prism-label font-semibold text-prism-ink">
          {S.capLabel}
        </label>
        <div className={`${wellClass(!!capError(draft.cap))} max-w-[160px]`}>
          <input
            id="dm-cap"
            inputMode="numeric"
            value={draft.cap}
            maxLength={3}
            onChange={event =>
              update({ cap: event.target.value.replace(/\D/g, "") }, AUTOSAVE_DELAY_MS)
            }
            aria-invalid={!!capError(draft.cap) || undefined}
            aria-describedby="dm-cap-help"
            className="min-w-0 flex-1 bg-transparent text-prism-label tabular-nums text-prism-ink outline-none"
          />
        </div>
        {capError(draft.cap) ? (
          <FieldError id="dm-cap-help">{capError(draft.cap)}</FieldError>
        ) : (
          <p id="dm-cap-help" className="text-prism-meta text-prism-ink-2">
            {S.capHelper}
          </p>
        )}
      </div>

      <Checkbox
        checked={draft.replyFromTelegram}
        disabled={save.isPending}
        onCheckedChange={checked => update({ replyFromTelegram: checked })}
        helper={S.replyFromTelegram.helper}
      >
        {S.replyFromTelegram.label}
      </Checkbox>
    </section>
  );
}
