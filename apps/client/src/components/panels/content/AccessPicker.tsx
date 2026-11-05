import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Globe, Loader2, Lock } from "lucide-react";
import { Input, cn, queryClient, trpc, trpcClient } from "@repo/ui";
import {
  ACCESS_RULE_SUMMARIES,
  ACCESS_STAKE_DISCLOSURE,
  TESTNET_NOTICE,
  type ContentAccessInput,
  type ContentAccessLeaf,
} from "@repo/constants";
import { CONTENT_COPY } from "./copy";
import { LaterPill } from "./parts";
import { EYEBROW_NAV } from "./lib/labels";
import { ACCESS_INSIGHTS_COPY } from "../people/accessCopy";

const e = CONTENT_COPY.editor;
const g = e.gate;

type LeafKind = "follower" | "pool_member" | "stake_min";
type Choice = "everyone" | LeafKind | "any";

/** What content.get returns for the item's rule (owner only, with their own params). */
export interface EditorAccess {
  ruleId: string;
  valid: boolean;
  kind?: string;
  /** The creator's name for a saved rule; null for a rule set on this item or block */
  name?: string | null;
  /** G6: "Open to everyone on" (decision 8). ISO time or null */
  opensToAllAt?: string | null;
  params?: Record<string, unknown>;
  leaves?: Array<{ ruleId: string; kind: string; params: Record<string, unknown> }>;
}

export interface EditorGating {
  stakeKindsAllowed: boolean;
  poolId: number | null;
}

const WEI = 10n ** 18n;

/** Stored wei back to whole tREVO for the input. */
function weiToWhole(wei: unknown): string {
  if (typeof wei !== "string" || !/^\d+$/.test(wei)) return "";
  return (BigInt(wei) / WEI).toString();
}

const WHOLE = /^[1-9]\d{0,20}$/;

/** ISO time to the local "YYYY-MM-DD" a date input shows. */
export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A date input's "YYYY-MM-DD" to the ISO time of that local midnight; "" is null. */
export function dateInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function initialState(access: EditorAccess | null | undefined) {
  const leaves = new Set<LeafKind>();
  let choice: Choice = "everyone";
  let amount = "";
  if (access?.valid && access.kind) {
    if (access.kind === "any") {
      choice = "any";
      for (const leaf of access.leaves ?? []) {
        if (leaf.kind === "follower" || leaf.kind === "pool_member" || leaf.kind === "stake_min") {
          leaves.add(leaf.kind);
          if (leaf.kind === "stake_min") amount = weiToWhole(leaf.params.minWei);
        }
      }
    } else if (
      access.kind === "follower" ||
      access.kind === "pool_member" ||
      access.kind === "stake_min"
    ) {
      choice = access.kind;
      if (access.kind === "stake_min") amount = weiToWhole(access.params?.minWei);
    }
  }
  return { choice, leaves, amount };
}

function Radio({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full border-[1.5px]",
        selected ? "border-prism-nav" : "border-[rgba(22,21,43,0.56)]"
      )}
    >
      {selected && <span className="h-[11px] w-[11px] rounded-full bg-prism-nav" />}
    </span>
  );
}

/**
 * Who can open this (content gating 4.1, cs3). Everyone, Followers, Pool fans,
 * Fans with a minimum stake and Any of these are live behind the accessGating
 * flag; Members and Paid show Later until PR 10 and PR 11. Stake rules need the
 * pilot allowlist and the creator's own pool. Any option that shows a pool or
 * tREVO shows TESTNET_NOTICE and the stake disclosure.
 */
export function AccessPicker({
  publicId,
  access,
  gating,
  onSave,
  inline = false,
}: {
  /** A content item: saves through content.update and shows the locked preview */
  publicId?: string;
  access: EditorAccess | null | undefined;
  gating: EditorGating | null | undefined;
  /** Another resource (a block, G3) saves through its own call */
  onSave?: (next: ContentAccessInput | null) => Promise<void>;
  /** Inside a block row's fields: no card of its own */
  inline?: boolean;
}) {
  const headingId = useId();
  const amountId = useId();
  const start = initialState(access);
  const [choice, setChoice] = useState<Choice>(start.choice);
  const [leaves, setLeaves] = useState<Set<LeafKind>>(start.leaves);
  const [amount, setAmount] = useState(start.amount);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dateId = useId();
  const [opensOn, setOpensOn] = useState(isoToDateInput(access?.opensToAllAt));
  const [dateNote, setDateNote] = useState<string | null>(null);
  // A new choice writes a new inline rule; its early access date carries over to it
  const carryDate = useRef<string | null>(null);

  // A refetch with another rule (another tab) resets the picker
  const ruleId = access?.ruleId ?? null;
  useEffect(() => {
    const next = initialState(access);
    setChoice(next.choice);
    setLeaves(next.leaves);
    setAmount(next.amount);
    const carried = carryDate.current;
    carryDate.current = null;
    if (carried && access?.valid && access.name == null && !access.opensToAllAt) {
      void saveDate(carried);
    } else {
      setOpensOn(isoToDateInput(access?.opensToAllAt));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleId]);

  /** The early access date on this item's own rule (G6, decision 8). */
  async function saveDate(value: string) {
    if (!access?.ruleId) return;
    const iso = dateInputToIso(value);
    setOpensOn(value);
    setDateNote(null);
    try {
      await trpcClient.access.rules.update.mutate({ id: access.ruleId, opensToAllAt: iso });
      setDateNote(ACCESS_INSIGHTS_COPY.early.saved);
      await queryClient.invalidateQueries({
        queryKey: publicId
          ? trpc.content.get.queryKey({ publicId })
          : trpc.blocks.getAccess.queryKey(),
      });
    } catch {
      setDateNote(ACCESS_INSIGHTS_COPY.early.failed);
    }
  }

  const stakeOk = Boolean(gating?.stakeKindsAllowed && gating.poolId);
  const stakeBlocked = gating?.stakeKindsAllowed ? g.noPool : g.notAllowed;
  const poolId = gating?.poolId ?? 0;

  const leafInput = (kind: LeafKind, minTrevo = amount): ContentAccessLeaf | null => {
    if (kind === "follower") return { kind, params: {} };
    if (!stakeOk) return null;
    if (kind === "pool_member") return { kind, params: { poolId } };
    return WHOLE.test(minTrevo) ? { kind, params: { poolId, minTrevo } } : null;
  };

  async function save(next: ContentAccessInput | null) {
    carryDate.current = next && opensOn ? opensOn : null;
    setSaving(true);
    setError(null);
    try {
      if (onSave) await onSave(next);
      else if (publicId) {
        await trpcClient.content.update.mutate({ publicId, access: next });
        await queryClient.invalidateQueries({
          queryKey: trpc.content.get.queryKey({ publicId }),
        });
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : g.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  function pick(next: Choice) {
    setChoice(next);
    if (next === "everyone") return void save(null);
    if (next === "any") {
      const input = anyInput(leaves);
      if (input) void save(input);
      return;
    }
    const leaf = leafInput(next);
    if (leaf) void save(leaf);
  }

  function anyInput(set: Set<LeafKind>): ContentAccessInput | null {
    const built = [...set].map(kind => leafInput(kind)).filter(Boolean) as ContentAccessLeaf[];
    return built.length >= 2 && built.length === set.size ? { kind: "any", leaves: built } : null;
  }

  function toggleLeaf(kind: LeafKind) {
    const next = new Set(leaves);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    setLeaves(next);
    const input = anyInput(next);
    if (input) void save(input);
  }

  function commitAmount() {
    if (!WHOLE.test(amount)) return;
    if (choice === "stake_min") void save(leafInput("stake_min"));
    if (choice === "any" && leaves.has("stake_min")) {
      const input = anyInput(leaves);
      if (input) void save(input);
    }
  }

  const showsStake =
    choice === "pool_member" ||
    choice === "stake_min" ||
    (choice === "any" && (leaves.has("pool_member") || leaves.has("stake_min")));
  const needsAmount = choice === "stake_min" || (choice === "any" && leaves.has("stake_min"));
  const amountInvalid = needsAmount && amount !== "" && !WHOLE.test(amount);

  const rows: Array<{
    value: Choice | "member" | "paid";
    label: string;
    help: string;
    later?: boolean;
    disabled?: string | null;
  }> = [
    { value: "everyone", label: e.rules.everyone![0], help: g.everyoneHelp },
    { value: "follower", label: ACCESS_RULE_SUMMARIES.follower, help: g.followerHelp },
    {
      value: "pool_member",
      label: ACCESS_RULE_SUMMARIES.pool_member,
      help: g.poolHelp,
      disabled: stakeOk ? null : stakeBlocked,
    },
    {
      value: "stake_min",
      label: ACCESS_RULE_SUMMARIES.stake_min,
      help: g.stakeHelp,
      disabled: stakeOk ? null : stakeBlocked,
    },
    { value: "any", label: ACCESS_RULE_SUMMARIES.any, help: g.anyHelp },
    { value: "member", label: ACCESS_RULE_SUMMARIES.member, help: g.memberHelp, later: true },
    { value: "paid", label: ACCESS_RULE_SUMMARIES.paid, help: g.paidHelp, later: true },
  ];

  return (
    <section
      aria-labelledby={headingId}
      className={
        inline ? "space-y-[13px]" : "prism-glass-clear space-y-[13px] !rounded-prism-21 p-[21px]"
      }
    >
      {!inline && <p className={EYEBROW_NAV}>{e.accessEyebrow}</p>}
      <h2 id={headingId} className="flex items-center gap-2 text-prism-panel-title text-prism-ink">
        {e.accessTitle}
        {saving && (
          <Loader2
            className="h-4 w-4 animate-spin text-prism-ink-2 motion-reduce:animate-none"
            aria-label={e.saving}
          />
        )}
      </h2>
      <div role="radiogroup" aria-labelledby={headingId} className="space-y-1">
        {rows.map(row => {
          const live = !row.later && !row.disabled;
          const selected = row.value === choice;
          return (
            <button
              key={row.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={!live}
              disabled={!live || saving}
              onClick={() => live && pick(row.value as Choice)}
              className={cn(
                "flex min-h-touch w-full items-center gap-3 rounded-prism-13 px-[13px] py-[8px] text-left",
                selected && "bg-white/70 shadow-[0_0_0_1.5px_#5650A2]",
                !live && "cursor-default"
              )}
            >
              <Radio selected={selected} />
              <span className="min-w-0 flex-1">
                <span className="block text-prism-label font-semibold text-prism-ink">
                  {row.label}
                </span>
                <span className="block text-prism-meta text-prism-ink-2">
                  {row.disabled ?? row.help}
                </span>
              </span>
              {row.later ? (
                <LaterPill />
              ) : row.value === "everyone" ? (
                <Globe className="h-5 w-5 shrink-0 text-prism-ink-2" aria-hidden />
              ) : (
                <Lock className="h-5 w-5 shrink-0 text-prism-ink-2" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      {choice === "any" && (
        <fieldset className="space-y-1 rounded-prism-13 bg-white/50 p-[13px]">
          <legend className="text-prism-meta font-semibold text-prism-ink">{g.anyPick}</legend>
          {(["follower", "pool_member", "stake_min"] as const).map(kind => {
            const blocked = kind !== "follower" && !stakeOk;
            return (
              <label key={kind} className="flex min-h-touch items-center gap-3">
                <input
                  type="checkbox"
                  className="h-[18px] w-[18px] accent-[#5650A2]"
                  checked={leaves.has(kind)}
                  disabled={blocked || saving}
                  onChange={() => toggleLeaf(kind)}
                />
                <span className="text-prism-label text-prism-ink">
                  {ACCESS_RULE_SUMMARIES[kind]}
                  {blocked && (
                    <span className="block text-prism-meta text-prism-ink-2">{stakeBlocked}</span>
                  )}
                </span>
              </label>
            );
          })}
          {leaves.size < 2 && <p className="text-prism-meta text-prism-ink-2">{g.anyTooFew}</p>}
        </fieldset>
      )}

      {needsAmount && (
        <div className="space-y-1">
          <label htmlFor={amountId} className="text-prism-label font-semibold text-prism-ink">
            {g.amountLabel}
          </label>
          <div className="flex items-center gap-2">
            <Input
              id={amountId}
              inputMode="numeric"
              autoComplete="off"
              value={amount}
              aria-invalid={amountInvalid}
              aria-describedby={`${amountId}-help`}
              onChange={event => setAmount(event.target.value.replace(/[^\d]/g, ""))}
              onBlur={commitAmount}
              onKeyDown={event => event.key === "Enter" && commitAmount()}
            />
            <span className="shrink-0 rounded-prism-8 bg-prism-nav-tint px-2 py-1 text-prism-meta font-semibold text-prism-nav-pressed">
              {g.amountUnit}
            </span>
          </div>
          <p id={`${amountId}-help`} className="text-prism-meta text-prism-ink-2">
            {amountInvalid ? g.amountInvalid : g.amountHelp}
          </p>
        </div>
      )}

      {choice !== "everyone" && access?.valid && access.name == null && (
        <EarlyAccessRow
          id={dateId}
          value={opensOn}
          note={dateNote}
          disabled={saving}
          onChange={value => void saveDate(value)}
        />
      )}

      {showsStake && (
        <div className="space-y-1 rounded-prism-13 bg-prism-warning-bg p-[13px]">
          <p className="text-prism-meta font-semibold text-prism-warning-ink">{TESTNET_NOTICE}</p>
          <p className="text-prism-meta text-prism-warning-ink">{ACCESS_STAKE_DISCLOSURE}</p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-prism-meta font-semibold text-prism-danger">
          {error}
        </p>
      )}

      {choice !== "everyone" && publicId && <LockedPreview publicId={publicId} />}
      <p className="text-prism-meta text-prism-ink-2">{inline ? g.blockNote : g.note}</p>
    </section>
  );
}

/**
 * Early access (gating spec 3.10 delta 4, decision 8): fans who pass the rule open it now,
 * and everyone can open it from this date. The earliest date is tomorrow.
 */
function EarlyAccessRow({
  id,
  value,
  note,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  note: string | null;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const E = ACCESS_INSIGHTS_COPY.early;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-prism-label font-semibold text-prism-ink">
        {E.label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="date"
          min={isoToDateInput(tomorrow.toISOString())}
          value={value}
          disabled={disabled}
          aria-describedby={`${id}-help`}
          onChange={event => onChange(event.target.value)}
        />
        {value && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange("")}
            className="prism-focus min-h-touch shrink-0 rounded-prism-13 px-[13px] text-prism-label font-semibold text-prism-nav"
          >
            {E.clear}
          </button>
        )}
      </div>
      <p id={`${id}-help`} className="text-prism-meta text-prism-ink-2">
        {E.help}
      </p>
      {note && (
        <p role="status" className="text-prism-meta text-prism-ink-2">
          {note}
        </p>
      )}
    </div>
  );
}

/** The live preview as a locked fan (content gating 4.1), from content.getPreview. */
function LockedPreview({ publicId }: { publicId: string }) {
  const preview = useQuery({
    ...trpc.content.getPreview.queryOptions({ publicId }),
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
  const blur = preview.data?.blur ?? null;
  return (
    <div className="flex items-center gap-3 rounded-prism-13 bg-white/50 p-[13px]">
      <div className="relative h-[55px] w-[89px] shrink-0 overflow-hidden rounded-prism-8 bg-[rgba(22,21,43,0.08)]">
        {blur && (
          <img src={blur} alt="" className="h-full w-full scale-110 object-cover blur-[6px]" />
        )}
        <Lock
          className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow"
          aria-hidden
        />
      </div>
      <div className="min-w-0">
        <p className="text-prism-label font-semibold text-prism-ink">{g.previewTitle}</p>
        <p className="text-prism-meta text-prism-ink-2">{g.previewNone}</p>
      </div>
    </div>
  );
}
