import { useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Info, Loader2, RefreshCw, Users } from "lucide-react";
import {
  DM_RULE_LABELS,
  TELEGRAM_APP_STRINGS as S,
  TELEGRAM_GROUP_STRINGS as G,
  TELEGRAM_LIMITS,
  type DmRuleKind,
} from "@repo/constants";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorCard,
  Notice,
  Skeleton,
  StepBar,
  cn,
  trpc,
  trpcClient,
} from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { RuleTiles } from "./RuleTiles";
import {
  GROUP_RULE_KINDS,
  ago,
  pendingGroup,
  useTelegramGroups,
  type TelegramGroupView,
} from "./telegramGroupsData";
import {
  errorMessage,
  stakeMinError,
  telegramDmLink,
  useOpenTelegramWizard,
  type RuleValue,
} from "./shared";

/**
 * Telegram groups, the creator side (Build Board #2, phase 2, spec r3 3.2 and 3.4,
 * boards tg5, tg10 and tg14). The bot finds the group when the creator makes it an
 * admin (tg-group-connect); the card shows it and the creator confirms it with the
 * rule. Connected groups show members, the rule with Change (the dialog counts who
 * would no longer qualify before Save), the approval only invite link and the last
 * week. Behind VITE_SHOW_TELEGRAM and the server's TELEGRAM_GROUPS.
 */

async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.add({ type: "success", title: done });
  } catch {
    toast.add({ type: "error", title: S.copyFailed });
  }
}

function Eyebrow({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h3 id={id} className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2">
      <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-nav" />
      {children}
    </h3>
  );
}

function CopyButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="prism-icon-btn prism-focus shrink-0"
    >
      <Copy aria-hidden className="h-[18px] w-[18px] text-prism-ink-2" strokeWidth={1.5} />
    </button>
  );
}

function GroupMark() {
  return (
    <span aria-hidden className="prism-icon-btn pointer-events-none shrink-0">
      <Users className="h-[21px] w-[21px] text-prism-ink" strokeWidth={1.5} />
    </span>
  );
}

/** Steps 1 and 2 with copy buttons, under the three step bar (boards tg5 and tg10). */
export function ConnectSteps({
  found,
  botUsername,
  showBar = true,
}: {
  found: boolean;
  botUsername: string | null | undefined;
  showBar?: boolean;
}) {
  const bot = `@${botUsername || "AmpedBioBot"}`;
  return (
    <div className="space-y-[13px]">
      {showBar && (
        <StepBar steps={[G.stepAddBot, G.stepMakeAdmin, G.stepConfirm]} current={found ? 2 : 0} />
      )}
      <ol className="prism-well rounded-prism-13">
        {[
          { n: 1, text: G.rowAddBot, label: G.copyBotName, copy: bot, done: G.copiedBotName },
          {
            n: 2,
            text: G.rowMakeAdmin,
            label: G.copyRights,
            copy: "Invite users, Ban users",
            done: G.copiedRights,
          },
        ].map(row => (
          <li
            key={row.n}
            className="flex min-h-touch items-center gap-3 px-[13px] py-2 text-prism-body text-prism-ink [&+li]:border-t [&+li]:border-black/5"
          >
            <span className="font-semibold tabular-nums">{row.n}</span>
            <span className="min-w-0 flex-1">{row.text}</span>
            <CopyButton label={row.label} onClick={() => void copyText(row.copy, row.done)} />
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The group the bot found, or the waiting line until it does. */
export function DetectedGroup({
  group,
  line,
}: {
  group: TelegramGroupView | null;
  /** Under the title; defaults to "Added by you. Connect it?" */
  line?: string;
}) {
  if (!group) {
    return (
      <div role="status" className="prism-slab flex items-center gap-3 rounded-prism-13 p-[13px]">
        <RefreshCw
          aria-hidden
          className="h-[21px] w-[21px] shrink-0 animate-spin text-prism-ink-2 [animation-duration:3s] motion-reduce:animate-none"
          strokeWidth={1.5}
        />
        <div className="min-w-0">
          <p className="text-prism-label font-semibold text-prism-ink">{G.waitingTitle}</p>
          <p className="text-prism-meta text-prism-ink-2">{G.waitingLine}</p>
        </div>
      </div>
    );
  }
  return (
    <div role="status" className="prism-lens flex items-center gap-[13px] rounded-prism-21 p-4">
      <GroupMark />
      <div className="min-w-0">
        <p className="text-prism-label font-semibold text-prism-ink">{G.found(group.title)}</p>
        <p className="text-prism-meta text-prism-ink-2">
          {group.botIsAdmin ? (line ?? G.foundLine) : G.foundNoRights}
        </p>
      </div>
    </div>
  );
}

function initialRule(
  kind: DmRuleKind | undefined,
  stakeMin: string | null | undefined,
  hasPool: boolean
) {
  const fallback: DmRuleKind = hasPool ? "POOL_MEMBER" : "FOLLOWER";
  const ruleKind = kind && (GROUP_RULE_KINDS as readonly string[]).includes(kind) ? kind : fallback;
  return { ruleKind, stakeMin: ruleKind === "STAKE_MIN" ? (stakeMin ?? "") : "" };
}

const PRIVATE_LINK = /t\.me\/(\+|joinchat)/i;
const PUBLIC_NAME =
  /^@?(?:https?:\/\/)?(?:(?:www\.)?(?:t|telegram)\.me\/)?[A-Za-z][A-Za-z0-9_]{3,31}\/?$/;

/** Connect a group: the steps, the group the bot found, who gets in, Connect group. */
function ConnectPanel({
  pending,
  botUsername,
  linked,
  hasPool,
  defaultRule,
}: {
  pending: TelegramGroupView | null;
  botUsername: string | null | undefined;
  linked: boolean;
  hasPool: boolean;
  defaultRule: RuleValue;
}) {
  const queryClient = useQueryClient();
  const openWizard = useOpenTelegramWizard();
  const [rule, setRule] = useState<RuleValue>(defaultRule);
  const [pasting, setPasting] = useState(false);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pasteId = useId();

  const privateLink = PRIVATE_LINK.test(username);
  const publicOk = !privateLink && PUBLIC_NAME.test(username.trim());
  const ruleError = stakeMinError(rule);
  const usePaste = pasting && !pending;

  const connect = useMutation({
    mutationFn: () => {
      const ruleInput = {
        ruleKind: rule.ruleKind,
        stakeMin: rule.ruleKind === "STAKE_MIN" ? rule.stakeMin : null,
      };
      return usePaste
        ? trpcClient.telegram.groups.connectPublic.mutate({
            username: username.trim(),
            ...ruleInput,
          })
        : trpcClient.telegram.groups.connect.mutate({ groupId: pending!.id, ...ruleInput });
    },
    onSuccess: async () => {
      setError(null);
      setPasting(false);
      setUsername("");
      toast.add({ type: "success", title: G.connected });
      await queryClient.invalidateQueries({ queryKey: trpc.telegram.groups.list.queryKey() });
    },
    onError: err => setError(errorMessage(err, G.failed)),
  });

  if (!linked) {
    return (
      <div className="prism-glass-clear space-y-[13px] rounded-prism-21 p-5">
        <ConnectSteps found={false} botUsername={botUsername} />
        <Notice variant="info">
          <p>{G.waitingLink}</p>
          <Button variant="ghost" className="mt-2" onClick={openWizard}>
            {S.linkButton}
          </Button>
        </Notice>
      </div>
    );
  }

  const ready = usePaste ? publicOk : !!pending?.botIsAdmin;
  return (
    <div className="prism-glass-clear space-y-[21px] rounded-prism-21 p-5">
      <ConnectSteps found={!!pending} botUsername={botUsername} />
      <DetectedGroup group={pending} />

      {pasting && !pending && (
        <div className="space-y-2">
          <label htmlFor={pasteId} className="block text-prism-label font-semibold text-prism-ink">
            {G.publicLabel}
          </label>
          <div className="prism-well flex min-h-touch items-center rounded-prism-13 px-[13px]">
            <input
              id={pasteId}
              value={username}
              placeholder={G.publicPlaceholder}
              autoComplete="off"
              maxLength={80}
              onChange={event => setUsername(event.target.value)}
              aria-describedby={privateLink ? `${pasteId}-private` : undefined}
              className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink outline-none"
            />
          </div>
          {privateLink && (
            <Notice variant="warning" id={`${pasteId}-private`}>
              {G.privateLinkNotice}
            </Notice>
          )}
        </div>
      )}

      <div className="space-y-[13px]">
        <Eyebrow>{G.whoGetsIn}</Eyebrow>
        <RuleTiles
          value={rule}
          onChange={setRule}
          hasPool={hasPool}
          kinds={GROUP_RULE_KINDS}
          helpers={G.ruleHelpers}
          legend={G.whoGetsIn}
          disabled={connect.isPending}
          stakeError={rule.stakeMin ? ruleError : null}
        />
      </div>

      {error && <Notice variant="error">{error}</Notice>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          size="lg"
          onClick={() => connect.mutate()}
          disabled={!ready || !!ruleError || connect.isPending}
          aria-busy={connect.isPending}
        >
          {connect.isPending && (
            <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />
          )}
          {G.connect}
        </Button>
        {!pending && (
          <Button variant="link" onClick={() => setPasting(open => !open)}>
            {pasting ? G.cancel : `${G.publicPrompt} ${G.publicPaste}`}
          </Button>
        )}
      </div>
    </div>
  );
}

function ChangeRuleDialog({
  group,
  open,
  onOpenChange,
  hasPool,
}: {
  group: TelegramGroupView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasPool: boolean;
}) {
  const queryClient = useQueryClient();
  const [rule, setRule] = useState<RuleValue>(() =>
    initialRule(group.ruleKind, group.stakeMin, hasPool)
  );
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setRule(initialRule(group.ruleKind, group.stakeMin, hasPool));
      setError(null);
    }
  }, [open, group.ruleKind, group.stakeMin, hasPool]);

  const ruleError = stakeMinError(rule);
  const stakeMin = rule.ruleKind === "STAKE_MIN" ? rule.stakeMin : null;
  const changed =
    rule.ruleKind !== group.ruleKind || (stakeMin ?? null) !== (group.stakeMin ?? null);
  const preview = useQuery({
    ...trpc.telegram.groups.previewRule.queryOptions({
      groupId: group.id,
      ruleKind: rule.ruleKind,
      stakeMin,
    }),
    enabled: open && changed && !ruleError,
    staleTime: 30_000,
  });
  const save = useMutation({
    mutationFn: () =>
      trpcClient.telegram.groups.setRule.mutate({
        groupId: group.id,
        ruleKind: rule.ruleKind,
        stakeMin,
      }),
    onSuccess: async () => {
      toast.add({ type: "success", title: G.saved });
      await queryClient.invalidateQueries({ queryKey: trpc.telegram.groups.list.queryKey() });
      onOpenChange(false);
    },
    onError: err => setError(errorMessage(err, G.failed)),
  });

  const loss = preview.data?.wouldRemove;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[848px]">
        <DialogHeader>
          <DialogTitle>{G.changeTitle}</DialogTitle>
          <DialogDescription className="sr-only">{G.whoGetsIn}</DialogDescription>
        </DialogHeader>
        <div className="space-y-[13px] font-prism">
          <RuleTiles
            value={rule}
            onChange={setRule}
            hasPool={hasPool}
            kinds={GROUP_RULE_KINDS}
            helpers={G.ruleHelpers}
            legend={G.whoGetsIn}
            disabled={save.isPending}
            stakeError={rule.stakeMin ? ruleError : null}
          />
          {changed && !ruleError && loss !== undefined && (
            <Notice variant={loss > 0 ? "warning" : "info"} role="status">
              {loss > 0 ? G.changeWarning(loss) : G.changeNoLoss}
            </Notice>
          )}
          {error && <Notice variant="error">{error}</Notice>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {G.cancel}
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!changed || !!ruleError || save.isPending || (changed && preview.isLoading)}
            aria-busy={save.isPending}
          >
            {save.isPending && (
              <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />
            )}
            {G.saveRule}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisconnectDialog({
  group,
  open,
  onOpenChange,
}: {
  group: TelegramGroupView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const disconnect = useMutation({
    mutationFn: () => trpcClient.telegram.groups.disconnect.mutate({ groupId: group.id }),
    onSuccess: async () => {
      toast.add({ type: "success", title: G.disconnected });
      await queryClient.invalidateQueries({ queryKey: trpc.telegram.groups.list.queryKey() });
      onOpenChange(false);
    },
    onError: err => toast.add({ type: "error", title: errorMessage(err, G.failed) }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{G.disconnectTitle}</DialogTitle>
          <DialogDescription>{G.disconnectBody}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {G.cancel}
          </Button>
          <Button
            variant="destructive"
            onClick={() => disconnect.mutate()}
            disabled={disconnect.isPending}
            aria-busy={disconnect.isPending}
          >
            {G.disconnect}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[28px] font-bold leading-9 tabular-nums text-prism-ink">{value}</span>
      <span className="text-prism-meta text-prism-ink-2">{label}</span>
    </div>
  );
}

/** One connected group (board tg5, right). */
function ConnectedGroupCard({ group, hasPool }: { group: TelegramGroupView; hasPool: boolean }) {
  const queryClient = useQueryClient();
  const [changing, setChanging] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const titleId = useId();
  const checked = ago(group.lastCheckedAt);

  const removeUnverified = useMutation({
    mutationFn: (value: boolean) =>
      trpcClient.telegram.groups.setRemoveUnverified.mutate({ groupId: group.id, value }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: trpc.telegram.groups.list.queryKey() }),
    onError: err => toast.add({ type: "error", title: errorMessage(err, G.failed) }),
  });
  const recheck = useMutation({
    mutationFn: () => trpcClient.telegram.groups.recheck.mutate({ groupId: group.id }),
    onSuccess: () => toast.add({ type: "success", title: G.recheckQueued }),
    onError: err => toast.add({ type: "error", title: errorMessage(err, G.failed) }),
  });

  return (
    <article
      aria-labelledby={titleId}
      className="prism-glass-clear space-y-[13px] rounded-prism-21 p-5 font-prism"
    >
      <div className="flex items-start gap-[13px]">
        <GroupMark />
        <div className="min-w-0 flex-1">
          <h4 id={titleId} className="text-prism-card-title text-prism-ink">
            {group.title}
          </h4>
          <p className="text-prism-meta text-prism-ink-2">
            {group.botIsAdmin ? G.privateBotAdmin : G.foundNoRights}{" "}
            {checked ? G.checkedAgo(checked) : G.notChecked}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-prism-meta font-semibold",
            group.botIsAdmin
              ? "bg-prism-success/10 text-prism-success"
              : "bg-amber-100 text-amber-800"
          )}
        >
          {group.botIsAdmin ? G.connected : G.rightsMissing}
        </span>
      </div>

      <dl className="prism-well rounded-prism-13">
        <div className="flex min-h-touch items-center justify-between gap-3 px-[13px] py-2">
          <dt className="text-prism-body text-prism-ink">{G.members}</dt>
          <dd className="text-prism-label font-semibold tabular-nums text-prism-ink">
            {group.memberCount.toLocaleString()}
          </dd>
        </div>
        <div className="flex min-h-touch items-center justify-between gap-3 border-t border-black/5 px-[13px] py-2">
          <dt className="text-prism-body text-prism-ink">{G.rule}</dt>
          <dd className="flex items-center gap-2 text-prism-body text-prism-ink">
            {DM_RULE_LABELS[group.ruleKind]}
            <Button variant="ghost" size="sm" onClick={() => setChanging(true)}>
              {G.change}
            </Button>
          </dd>
        </div>
        <div className="flex min-h-touch items-center justify-between gap-3 border-t border-black/5 px-[13px] py-2">
          <dt className="text-prism-body text-prism-ink">{G.inviteLink}</dt>
          <dd className="flex items-center gap-2 text-prism-body text-prism-ink">
            {G.approvalRequired}
            {group.inviteLink && (
              <CopyButton
                label={G.copyInvite}
                onClick={() => void copyText(group.inviteLink!, G.copiedInvite)}
              />
            )}
          </dd>
        </div>
      </dl>

      {group.week && (
        <div className="space-y-2">
          <p className="text-prism-meta text-prism-ink-2">{G.lastWeek}</p>
          <div className="prism-well grid grid-cols-3 rounded-prism-13 py-[13px]">
            <Stat value={group.week.approved} label={G.approved} />
            <Stat value={group.week.declined} label={G.declined} />
            <Stat value={group.week.removed} label={G.removed} />
          </div>
        </div>
      )}

      <Checkbox
        checked={group.removeUnverified}
        disabled={removeUnverified.isPending}
        onCheckedChange={value => removeUnverified.mutate(value)}
        helper={G.removeUnverified.helper}
      >
        {G.removeUnverified.label}
      </Checkbox>

      <p className="prism-slab flex items-start gap-3 rounded-prism-13 p-[13px] text-prism-meta text-prism-ink">
        <Info aria-hidden className="mt-0.5 h-[18px] w-[18px] shrink-0 text-prism-ink-2" />
        {G.infoLine}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => recheck.mutate()}
          disabled={recheck.isPending}
          aria-busy={recheck.isPending}
        >
          <RefreshCw aria-hidden />
          {G.recheck}
        </Button>
        <Button variant="ghost" onClick={() => setDisconnecting(true)}>
          {G.disconnect}
        </Button>
      </div>

      <ChangeRuleDialog
        group={group}
        open={changing}
        onOpenChange={setChanging}
        hasPool={hasPool}
      />
      <DisconnectDialog group={group} open={disconnecting} onOpenChange={setDisconnecting} />
    </article>
  );
}

/** Welcome message kit (board tg14): text and a button link for the channel's welcome message. */
export function WelcomeKitDialog({
  open,
  onOpenChange,
  link,
  handle,
  creatorName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: string;
  handle: string;
  creatorName: string;
}) {
  const text = G.kitText(link, handle);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{G.kitTitle}</DialogTitle>
          <DialogDescription>{G.kitLine}</DialogDescription>
        </DialogHeader>
        <div className="space-y-[13px] font-prism">
          <p className="prism-well whitespace-pre-wrap break-words rounded-prism-13 p-[13px] text-prism-body text-prism-ink">
            {text}
          </p>
          <dl className="prism-well rounded-prism-13">
            <div className="flex min-h-touch items-center justify-between gap-3 px-[13px] py-2">
              <dt className="text-prism-body text-prism-ink">{G.kitButtonLabel}</dt>
              <dd className="text-prism-label font-semibold text-prism-ink">
                {G.kitButtonText(creatorName)}
              </dd>
            </div>
            <div className="flex min-h-touch items-center justify-between gap-3 border-t border-black/5 px-[13px] py-2">
              <dt className="shrink-0 text-prism-body text-prism-ink">{G.kitButtonLink}</dt>
              <dd className="flex min-w-0 items-center gap-2 text-prism-body text-prism-ink">
                <span className="truncate">{link.replace(/^https:\/\//, "")}</span>
                <CopyButton
                  label={G.kitCopyLink}
                  onClick={() => void copyText(link, G.kitLinkCopied)}
                />
              </dd>
            </div>
          </dl>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => void copyText(link, G.kitLinkCopied)}>
            {G.kitCopyLink}
          </Button>
          <Button onClick={() => void copyText(text, G.kitCopied)}>{G.kitCopy}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The Telegram group tab (My Pool) and the same card in Inbox, Settings for creators
 * without a pool (board tg5).
 */
export function TelegramGroupsSection({
  handle,
  creatorName,
}: {
  handle: string;
  creatorName: string;
}) {
  const groups = useTelegramGroups({ listen: true });
  const status = useQuery(trpc.telegram.link.status.queryOptions());
  const settings = useQuery({
    ...trpc.messaging.creator.getSettings.queryOptions(),
    staleTime: 30_000,
  });
  const [adding, setAdding] = useState(false);
  const [kitOpen, setKitOpen] = useState(false);

  if (groups.isError) {
    return (
      <ErrorCard
        title={G.failed}
        cause="Try again in a moment."
        onRetry={() => void groups.refetch()}
      />
    );
  }
  if (!groups.data || !status.data || !settings.data) {
    return (
      <div aria-busy className="grid gap-[21px] lg:grid-cols-2">
        <Skeleton className="h-[420px] rounded-prism-21" />
        <Skeleton className="h-[420px] rounded-prism-21" />
      </div>
    );
  }
  if (!groups.data.enabled) return <Notice variant="info">{G.off}</Notice>;

  const hasPool = settings.data.requirements.hasPool;
  const connected = groups.data.groups.filter(group => group.state === "connected");
  const pending = pendingGroup(groups.data.groups);
  const canAdd = connected.length < TELEGRAM_LIMITS.groupsPerCreator;
  const showConnect = canAdd && (connected.length === 0 || adding || !!pending);
  const defaultRule = initialRule(
    settings.data.ruleKind as DmRuleKind,
    settings.data.stakeMin,
    hasPool
  );
  const dmLink =
    status.data.botUsername && status.data.linkCode
      ? telegramDmLink(status.data.botUsername, status.data.linkCode)
      : null;

  return (
    <div
      className={cn(
        "grid items-start gap-[21px] font-prism",
        showConnect && connected.length > 0 && "lg:grid-cols-2"
      )}
    >
      {showConnect && (
        <section aria-labelledby="tg-connect-title" className="space-y-[13px]">
          <Eyebrow id="tg-connect-title">{G.connectTitle}</Eyebrow>
          <ConnectPanel
            pending={pending}
            botUsername={status.data.botUsername}
            linked={status.data.linked}
            hasPool={hasPool}
            defaultRule={defaultRule}
          />
        </section>
      )}
      {connected.length > 0 && (
        <section aria-labelledby="tg-groups-title" className="space-y-[13px]">
          <Eyebrow id="tg-groups-title">{G.yourGroups}</Eyebrow>
          {connected.map(group => (
            <ConnectedGroupCard key={group.id} group={group} hasPool={hasPool} />
          ))}
          <div className="flex flex-wrap gap-2">
            {canAdd && !showConnect && (
              <Button variant="ghost" onClick={() => setAdding(true)}>
                {G.connectAnother}
              </Button>
            )}
            {dmLink && handle && (
              <Button variant="ghost" onClick={() => setKitOpen(true)}>
                {G.kitOpen}
              </Button>
            )}
          </div>
        </section>
      )}
      {dmLink && handle && (
        <WelcomeKitDialog
          open={kitOpen}
          onOpenChange={setKitOpen}
          link={dmLink}
          handle={handle}
          creatorName={creatorName}
        />
      )}
    </div>
  );
}
