import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, Send } from "lucide-react";
import {
  DEFAULT_TELEGRAM_MESSAGE_LABEL,
  TELEGRAM_APP_STRINGS as S,
  TELEGRAM_BLOCK_LABEL_MAX,
  type BlockType,
  type DmRuleKind,
} from "@repo/constants";
import {
  Button,
  ChipGroup,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Notice,
  Skeleton,
  StepBar,
  trpc,
  trpcClient,
} from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { useEditor } from "@/contexts/EditorContext";
import { publicPageUrl } from "@/components/shell/pageLink";
import { TelegramMessageBlock } from "@/components/blocks/TelegramMessageBlock";
import { FieldError } from "../page/blocks/LinkFields";
import { wellClass } from "../page/blocks/linkValue";
import { RuleTiles, type RuleValue } from "./RuleTiles";
import {
  WIZARD_PARAM,
  WIZARD_VALUE,
  errorMessage,
  stakeMinError,
  telegramBotLink,
  telegramDmLink,
} from "./shared";

type Position = "top" | "afterLinks" | "bottom";
const STEPS = [
  S.creatorWizard.steps.link,
  S.creatorWizard.steps.bot,
  S.creatorWizard.steps.messages,
  S.creatorWizard.steps.page,
];
const STEP = { link: 0, bot: 1, messages: 2, page: 3, done: 4 } as const;
const LINK_ERRORS: Record<string, string> = {
  conflict: S.errors.alreadyLinked,
  declined: S.errors.declined,
  expired: S.errors.declined,
  error: S.errors.declined,
};

/** Where the new block goes: first, after the last link, or last (Page step). */
function placeBlock(blocks: BlockType[], created: BlockType, position: Position) {
  const others = blocks.filter(block => block.id !== created.id);
  if (position === "bottom") return [...others, created];
  if (position === "top") return [created, ...others];
  const lastLink = others.reduce((at, block, index) => (block.type === "link" ? index : at), -1);
  return [...others.slice(0, lastLink + 1), created, ...others.slice(lastLink + 1)];
}

/**
 * Wizard A, creator setup (Screen Review 121, board tg10, spec 3.11a). One Dialog
 * with a step bar and one primary per step: Link Telegram, Open the bot, Turn on
 * messages, Add to my page. The bot step exists because the bot can only write to
 * someone who pressed Start in it. It resumes from live data (linked, bot started,
 * Fan messages on, block on the page), so leaving at any step is safe. The group
 * step and the share card wait
 * on groups and the Mini App; Done shows the Message link only. Opened by
 * ?wizard=telegram on any editor route; Telegram returns here with ?telegram=.
 */
export function TelegramWizard() {
  const [params, setParams] = useSearchParams();
  const open = params.get(WIZARD_PARAM) === WIZARD_VALUE;
  const queryClient = useQueryClient();
  const { blocks, addBlock, reorderBlocks, profile, theme } = useEditor();

  const status = useQuery({
    ...trpc.telegram.link.status.queryOptions(),
    enabled: open,
    // Telegram may open in another app, so focus alone may not bring the Start back
    refetchInterval: query => {
      const data = query.state.data;
      return data?.linked && (!data.botAccess || data.blocked) ? 5_000 : false;
    },
  });
  const settings = useQuery({
    ...trpc.messaging.creator.getSettings.queryOptions(),
    enabled: open,
  });
  const [step, setStep] = useState<number | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rule, setRule] = useState<RuleValue | null>(null);
  const [label, setLabel] = useState(DEFAULT_TELEGRAM_MESSAGE_LABEL);
  const [position, setPosition] = useState<Position>("afterLinks");
  const handledResult = useRef(false);

  const hasBlock = blocks.some(block => block.type === "telegram_message");
  const linked = !!status.data?.linked;
  // The bot can write to the creator only after Start was pressed in Telegram
  const reachable = !!status.data?.linked && status.data.botAccess && !status.data.blocked;
  const enabled = !!settings.data?.enabled;

  // The result Telegram sent back with, once
  const result = params.get("telegram");
  useEffect(() => {
    if (!open || !result || handledResult.current) return;
    handledResult.current = true;
    if (result === "linked") {
      toast.add({ type: "success", title: S.linkedToast });
      void queryClient.invalidateQueries({ queryKey: trpc.telegram.link.status.queryKey() });
      void queryClient.invalidateQueries({
        queryKey: trpc.messaging.creator.getSettings.queryKey(),
      });
    } else if (LINK_ERRORS[result]) {
      setLinkError(LINK_ERRORS[result]!);
    }
    setParams(
      current => {
        const next = new URLSearchParams(current);
        next.delete("telegram");
        return next;
      },
      { replace: true }
    );
  }, [open, result, queryClient, setParams]);

  // Resume at the first step not done, once the live data is in
  useEffect(() => {
    if (!open) {
      setStep(null);
      return;
    }
    if (step !== null || !status.data || !settings.data) return;
    setStep(
      !linked
        ? STEP.link
        : !reachable
          ? STEP.bot
          : !enabled
            ? STEP.messages
            : !hasBlock
              ? STEP.page
              : STEP.done
    );
  }, [open, step, status.data, settings.data, linked, reachable, enabled, hasBlock]);
  useEffect(() => {
    if (rule || !settings.data) return;
    setRule({
      ruleKind: settings.data.ruleKind as DmRuleKind,
      stakeMin: settings.data.stakeMin ?? "",
    });
  }, [rule, settings.data]);

  const close = () =>
    setParams(current => {
      const next = new URLSearchParams(current);
      next.delete(WIZARD_PARAM);
      next.delete("telegram");
      return next;
    });

  const start = useMutation({
    mutationFn: () => trpcClient.telegram.link.start.mutate({ returnTo: { to: "wizard" } }),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: error => setLinkError(errorMessage(error, S.errors.declined)),
  });

  const turnOn = useMutation({
    mutationFn: () =>
      trpcClient.messaging.creator.setSettings.mutate({
        enabled: true,
        ruleKind: rule!.ruleKind,
        stakeMin: rule!.ruleKind === "STAKE_MIN" ? rule!.stakeMin : null,
        dailyNewThreadCap: settings.data?.dailyNewThreadCap,
        replyFromTelegram: settings.data?.replyFromTelegram,
      }),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({
        queryKey: trpc.messaging.creator.getSettings.queryKey(),
      });
      setStep(hasBlock ? STEP.done : STEP.page);
    },
    onError: error => setActionError(errorMessage(error, S.settingsFailed)),
  });

  const markSetup = () =>
    trpcClient.onboarding.mark
      .mutate({ moment: "telegramSetup" })
      .then(next => queryClient.setQueryData(trpc.onboarding.status.queryKey(), next))
      .catch(() => undefined);

  const addToPage = useMutation({
    mutationFn: async () => {
      const created = await addBlock({
        id: 0,
        type: "telegram_message",
        order: 0,
        config: { label: label.trim() },
      } as BlockType);
      reorderBlocks(placeBlock([...blocks, created], created, position));
    },
    onSuccess: async () => {
      setActionError(null);
      await markSetup();
      try {
        await navigator.clipboard.writeText(publicPageUrl(profile.handle));
        toast.add({ type: "success", title: S.wizardDoneToast });
      } catch {
        toast.add({ type: "success", title: S.creatorWizard.pageOnPage });
      }
      setStep(STEP.done);
    },
    onError: error => setActionError(errorMessage(error, S.settingsFailed)),
  });

  const dmLink =
    status.data?.botUsername && status.data.linkCode
      ? telegramDmLink(status.data.botUsername, status.data.linkCode)
      : null;
  const copyDmLink = async () => {
    if (!dmLink) return;
    try {
      await navigator.clipboard.writeText(dmLink);
      toast.add({ type: "success", title: S.creatorWizard.doneCopied });
    } catch {
      toast.add({ type: "error", title: S.copyFailed });
    }
  };

  const W = S.creatorWizard;
  const labelError = label.trim() ? null : S.blockLabelRequired;
  const ruleError = rule ? stakeMinError(rule) : null;

  let body: React.ReactNode;
  let footer: React.ReactNode = null;
  if (step === null || !rule) {
    body = (
      <div aria-busy className="space-y-3">
        <Skeleton className="h-5 w-48 rounded-full" />
        <Skeleton className="h-24 rounded-prism-13" />
      </div>
    );
  } else if (step === STEP.link) {
    body = (
      <div className="space-y-[13px]">
        <h3 className="text-prism-card-title text-prism-ink">{W.linkTitle}</h3>
        <ul className="space-y-2">
          {W.linkLines.map(line => (
            <li key={line} className="flex items-start gap-2 text-prism-body text-prism-ink">
              <Send aria-hidden className="mt-1 h-4 w-4 shrink-0 text-prism-nav" />
              {line}
            </li>
          ))}
        </ul>
        {linked && (
          <p className="flex items-center gap-2 text-prism-label font-semibold text-prism-success">
            <Check aria-hidden className="h-[21px] w-[21px]" />
            {status.data?.linked && status.data.username
              ? S.accountLinkedAs(status.data.username)
              : S.accountLinkedNoUsername}
          </p>
        )}
        {linkError && <Notice variant="error">{linkError}</Notice>}
        <p className="text-prism-meta text-prism-ink-2">{W.linkFootnote}</p>
      </div>
    );
    footer = linked ? (
      <Button size="lg" onClick={() => setStep(STEP.bot)}>
        {W.next}
      </Button>
    ) : (
      <Button
        size="lg"
        onClick={() => {
          setLinkError(null);
          start.mutate();
        }}
        disabled={start.isPending || status.data?.available === false}
        aria-busy={start.isPending}
      >
        {start.isPending && (
          <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />
        )}
        {W.linkButton}
      </Button>
    );
  } else if (step === STEP.bot) {
    const botUsername = status.data?.botUsername ?? null;
    body = (
      <div className="space-y-[13px]">
        <h3 className="text-prism-card-title text-prism-ink">{W.botTitle}</h3>
        <p className="text-prism-body text-prism-ink">{W.botLine}</p>
        {reachable ? (
          <p className="flex items-center gap-2 text-prism-label font-semibold text-prism-success">
            <Check aria-hidden className="h-[21px] w-[21px]" />
            {W.botStarted}
          </p>
        ) : (
          status.data?.linked &&
          status.data.blocked && <Notice variant="warning">{S.accountBlockedNotice}</Notice>
        )}
        <Notice variant="warning">{W.botKeepChat}</Notice>
      </div>
    );
    footer = reachable ? (
      <Button size="lg" onClick={() => setStep(STEP.messages)}>
        {W.next}
      </Button>
    ) : botUsername ? (
      <Button size="lg" asChild>
        <a href={telegramBotLink(botUsername)} target="_blank" rel="noopener noreferrer">
          <Send aria-hidden />
          {S.openBotButton}
        </a>
      </Button>
    ) : null;
  } else if (step === STEP.messages) {
    body = (
      <div className="space-y-[13px]">
        <h3 className="text-prism-card-title text-prism-ink">{W.messagesTitle}</h3>
        {enabled && (
          <p className="flex items-center gap-2 text-prism-label font-semibold text-prism-success">
            <Check aria-hidden className="h-[21px] w-[21px]" />
            {W.messagesOn}
          </p>
        )}
        <RuleTiles
          value={rule}
          onChange={setRule}
          hasPool={!!settings.data?.requirements.hasPool}
          disabled={enabled || turnOn.isPending}
          stakeError={rule.stakeMin ? ruleError : null}
        />
        {actionError && <Notice variant="error">{actionError}</Notice>}
      </div>
    );
    footer = enabled ? (
      <Button size="lg" onClick={() => setStep(hasBlock ? STEP.done : STEP.page)}>
        {W.next}
      </Button>
    ) : (
      <Button
        size="lg"
        onClick={() => turnOn.mutate()}
        disabled={turnOn.isPending || !!ruleError}
        aria-busy={turnOn.isPending}
      >
        {turnOn.isPending && (
          <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />
        )}
        {W.messagesButton}
      </Button>
    );
  } else if (step === STEP.page) {
    body = (
      <div className="space-y-[13px]">
        <h3 className="text-prism-card-title text-prism-ink">{W.pageTitle}</h3>
        <p className="text-prism-body text-prism-ink-2">{W.pageLine}</p>
        <div className="prism-well rounded-prism-13 p-[21px]">
          <TelegramMessageBlock
            theme={theme?.config}
            label={label}
            ruleKind={settings.data?.ruleKind as DmRuleKind}
          />
        </div>
        {hasBlock ? (
          <p className="flex items-center gap-2 text-prism-label font-semibold text-prism-success">
            <Check aria-hidden className="h-[21px] w-[21px]" />
            {W.pageOnPage}
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <label
                htmlFor="wizard-label"
                className="block text-prism-label font-semibold text-prism-ink"
              >
                {W.pageLabelField}
              </label>
              <div className={wellClass(!!labelError)}>
                <input
                  id="wizard-label"
                  value={label}
                  maxLength={TELEGRAM_BLOCK_LABEL_MAX}
                  onChange={event => setLabel(event.target.value)}
                  aria-invalid={!!labelError || undefined}
                  className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink outline-none"
                />
              </div>
              {labelError && <FieldError id="wizard-label-error">{labelError}</FieldError>}
            </div>
            <div className="space-y-2">
              <p className="text-prism-label font-semibold text-prism-ink">{W.pagePosition}</p>
              <ChipGroup
                label={W.pagePosition}
                value={position}
                onChange={setPosition}
                options={[
                  { value: "top", label: W.positions.top },
                  { value: "afterLinks", label: W.positions.afterLinks },
                  { value: "bottom", label: W.positions.bottom },
                ]}
              />
            </div>
          </>
        )}
        {actionError && <Notice variant="error">{actionError}</Notice>}
      </div>
    );
    footer = hasBlock ? (
      <Button
        size="lg"
        onClick={() => {
          void markSetup();
          setStep(STEP.done);
        }}
      >
        {W.next}
      </Button>
    ) : (
      <Button
        size="lg"
        onClick={() => addToPage.mutate()}
        disabled={addToPage.isPending || !!labelError || !profile.handle}
        aria-busy={addToPage.isPending}
      >
        {addToPage.isPending && (
          <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />
        )}
        {W.pageButton}
      </Button>
    );
  } else {
    body = (
      <div className="space-y-[13px]">
        <h3 className="text-prism-card-title text-prism-ink">{W.doneTitle}</h3>
        {dmLink && (
          <>
            <p className="text-prism-body text-prism-ink-2">{W.doneLine}</p>
            <div className="prism-well flex min-h-touch items-center gap-2 rounded-prism-13 px-[13px]">
              <span className="min-w-0 flex-1 truncate text-prism-label text-prism-ink">
                {dmLink.replace(/^https:\/\//, "")}
              </span>
              <Button variant="ghost" onClick={() => void copyDmLink()}>
                <Copy aria-hidden />
                {W.doneCopy}
              </Button>
            </div>
          </>
        )}
      </div>
    );
    footer = (
      <Button size="lg" onClick={close}>
        {W.doneClose}
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={next => !next && close()}>
      <DialogContent className="max-h-[848px]">
        <DialogHeader>
          <DialogTitle>{W.title}</DialogTitle>
          <DialogDescription className="sr-only">
            {step !== null && step < STEP.done ? W.stepOf(step + 1) : W.doneTitle}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-[21px] font-prism">
          {step !== null && <StepBar steps={STEPS} current={Math.min(step, STEPS.length)} />}
          {body}
        </div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
