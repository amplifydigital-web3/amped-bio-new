import { useId, useState, type ReactNode } from "react";
import { CalendarClock, ChevronDown, Info, Lock, Sparkles, WandSparkles } from "lucide-react";
import {
  LOCKABLE_BLOCK_TYPES,
  ATTENTION_LABELS,
  ATTENTION_PRESETS,
  ENTRANCE_LABELS,
  ENTRANCE_STYLES,
  attentionOf,
  motionSummary,
  scheduleSummary,
  type AttentionPreset,
  type BlockMotion,
  type BlockSchedule,
  type BlockSettings,
  type BlockType,
} from "@repo/constants";
import { Button, cn } from "@repo/ui";
import { BlockAccessFields } from "./BlockAccessFields";
import type { ConfigChange } from "./BlockFields";
import { FieldError } from "./LinkFields";
import { wellClass } from "./linkValue";
import {
  browserZone,
  scheduleErrors,
  utcToZonedWall,
  zonedWallToUtc,
  type WallTime,
} from "./scheduleTime";

// Block Review v2, Block settings row (Build Board #54, board bs1). Four
// disclosure rows at the bottom of every saved block: Schedule, Who can open
// this, Attention and Motion. One row is open at a time. Every change merges
// into the block's current config and goes through the row's onChange, so it
// autosaves like the block's own fields (D11).

type RowId = "schedule" | "access" | "attention" | "motion";

/** The block that asks for attention now, when it is not this one */
export type AttentionHolder = { id: number; title: string; preset: AttentionPreset };

const MESSAGING_TYPES = ["telegram_message", "telegram_group", "message"];

const iconClass = "h-[18px] w-[18px] shrink-0 text-prism-ink-2";
const helperClass = "text-prism-meta text-prism-ink-2";

/** Merges settings into a config. An undefined value removes that setting. */
export function mergeSettings(
  config: BlockType["config"],
  patch: Partial<BlockSettings>
): BlockType["config"] {
  const next = { ...(config as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next as BlockType["config"];
}

/** Keeps the saved settings when a block's own fields send a config without them */
export function keepSettings(
  current: BlockType["config"],
  next: BlockType["config"]
): BlockType["config"] {
  const settings = current as BlockSettings;
  return mergeSettings(next, {
    schedule: settings.schedule,
    attention: settings.attention,
    motion: settings.motion,
  });
}

function SettingsRow({
  icon,
  label,
  value,
  open,
  onToggle,
  children,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="prism-focus flex min-h-touch w-full items-center gap-2 rounded-prism-13 text-left"
      >
        {icon}
        <span className="flex-1 text-prism-label font-semibold text-prism-ink">{label}</span>
        <span className="text-prism-meta text-prism-ink-2">{value}</span>
        <ChevronDown aria-hidden className={cn(iconClass, open && "rotate-180")} />
      </button>
      {open && (
        <div id={panelId} className="mb-[13px] mt-2 space-y-[13px]">
          {children}
        </div>
      )}
    </div>
  );
}

/** A setting that lives elsewhere: not a button, no chevron */
function ReadOnlyRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-h-touch items-center gap-2">
      {icon}
      <span className="flex-1 text-prism-label font-semibold text-prism-ink">{label}</span>
      <span className="text-prism-meta text-prism-ink-2">{value}</span>
    </div>
  );
}

function DateTimeField({
  id,
  label,
  value,
  error,
  note,
  describedBy,
  onChange,
}: {
  id: string;
  label: string;
  value: WallTime;
  error?: string;
  note?: string;
  describedBy: string;
  onChange: (value: WallTime) => void;
}) {
  const errorId = `${id}-error`;
  const noteId = `${id}-note`;
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <label htmlFor={id} className="block text-prism-label font-semibold text-prism-ink">
        {label}
      </label>
      <div className={wellClass(!!error)}>
        <input
          id={id}
          type="datetime-local"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={[error && errorId, note && noteId, describedBy]
            .filter(Boolean)
            .join(" ")}
          onChange={event => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink outline-none"
        />
      </div>
      {/* Present while an error shows, so it is announced once */}
      <div role="alert">{error && <FieldError id={errorId}>{error}</FieldError>}</div>
      {note && (
        <p id={noteId} className={helperClass}>
          {note}
        </p>
      )}
    </div>
  );
}

export function ScheduleFields({
  schedule,
  onSave,
}: {
  schedule: BlockSchedule | undefined;
  onSave: (schedule: BlockSchedule | undefined) => void;
}) {
  const baseId = useId();
  const myZone = browserZone();
  const [zone, setZone] = useState(schedule?.zone ?? myZone);
  const [start, setStart] = useState(() =>
    schedule?.start ? utcToZonedWall(schedule.start, zone) : ""
  );
  const [end, setEnd] = useState(() => (schedule?.end ? utcToZonedWall(schedule.end, zone) : ""));
  const [countdown, setCountdown] = useState(schedule?.showCountdown ?? false);
  const errors = scheduleErrors(start, end, zone);
  const startAt = start ? zonedWallToUtc(start, zone) : null;
  const endAt = end ? zonedWallToUtc(end, zone) : null;
  const helpId = `${baseId}-help`;

  // Invalid input never saves; the last valid schedule stays
  const commit = (next: { start: WallTime; end: WallTime; countdown: boolean; zone: string }) => {
    const found = scheduleErrors(next.start, next.end, next.zone);
    if (found.start || found.end) return;
    if (!next.start && !next.end) {
      onSave(undefined);
      return;
    }
    const startIso = next.start ? zonedWallToUtc(next.start, next.zone)?.iso : undefined;
    const endIso = next.end ? zonedWallToUtc(next.end, next.zone)?.iso : undefined;
    onSave({
      zone: next.zone,
      showCountdown: next.countdown,
      ...(startIso ? { start: startIso } : {}),
      ...(endIso ? { end: endIso } : {}),
    });
  };

  const shiftNote = (at: typeof startAt) =>
    at?.shifted
      ? `That time does not exist in ${zone}. It moves to ${utcToZonedWall(at.iso, zone).replace(
          "T",
          " "
        )}.`
      : undefined;

  const otherZone = zone !== myZone;

  return (
    <>
      <div className="flex flex-col gap-[13px] sm:flex-row">
        <DateTimeField
          id={`${baseId}-start`}
          label="Go live"
          value={start}
          error={errors.start}
          note={shiftNote(startAt)}
          describedBy={helpId}
          onChange={value => {
            setStart(value);
            commit({ start: value, end, countdown, zone });
          }}
        />
        <DateTimeField
          id={`${baseId}-end`}
          label="Expire"
          value={end}
          error={errors.end}
          note={shiftNote(endAt)}
          describedBy={helpId}
          onChange={value => {
            setEnd(value);
            commit({ start, end: value, countdown, zone });
          }}
        />
      </div>
      <div id={helpId} className={helperClass}>
        {otherZone ? (
          <p>
            Times in {zone}. Your time zone is {myZone}. Visitors never see this block before it
            goes live. It leaves the page when it expires.
          </p>
        ) : (
          <p>
            Times in {zone}, your time zone. Visitors never see this block before it goes live. It
            leaves the page when it expires.
          </p>
        )}
      </div>
      {otherZone && (
        <Button
          type="button"
          variant="ghost"
          className="-ml-3"
          onClick={() => {
            // Keeps the same wall clock time in the new zone
            setZone(myZone);
            commit({ start, end, countdown, zone: myZone });
          }}
        >
          Use my time zone
        </Button>
      )}
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={countdown}
          onChange={event => {
            setCountdown(event.target.checked);
            commit({ start, end, countdown: event.target.checked, zone });
          }}
          className="mt-0.5 h-5 w-5 shrink-0 accent-prism-nav"
        />
        <span className="min-w-0">
          <span className="block text-prism-label text-prism-ink">
            Show a countdown before it goes live
          </span>
          <span className={cn("block", helperClass)}>
            Visitors see the label and Opens in. The link stays closed.
          </span>
        </span>
      </label>
      {(schedule || start || end) && (
        <Button
          type="button"
          variant="ghost"
          className="-ml-3"
          onClick={() => {
            setStart("");
            setEnd("");
            setCountdown(false);
            setZone(myZone);
            onSave(undefined);
          }}
        >
          Clear schedule
        </Button>
      )}
    </>
  );
}

const PREVIEW_CLASS: Record<AttentionPreset, string> = {
  off: "ring-1 ring-prism-line",
  shimmer:
    "ring-1 ring-prism-line bg-[linear-gradient(110deg,#ffffff_30%,#E6E4F5_50%,#ffffff_70%)]",
  glow: "shadow-[0_0_0_2px_rgba(86,80,162,0.25),0_0_13px_rgba(86,80,162,0.45)]",
  pulse: "ring-[3px] ring-[rgba(86,80,162,0.3)]",
  edge: "ring-[1.5px] ring-prism-nav",
  pop: "scale-105 ring-1 ring-prism-line shadow-[0_5px_13px_rgba(48,47,93,0.18)]",
};

export function AttentionFields({
  preset,
  label,
  holder,
  onPick,
  onMoveHere,
}: {
  preset: AttentionPreset;
  /** The button label drawn in each mini preview */
  label: string;
  holder: AttentionHolder | null;
  onPick: (preset: AttentionPreset) => void;
  onMoveHere: () => void;
}) {
  const name = useId();
  return (
    <>
      {holder && (
        <div role="status" className="prism-notice flex items-start gap-3">
          <Info aria-hidden className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-nav" />
          <div className="min-w-0 flex-1 text-prism-label text-prism-ink">
            <p>Only one block can ask for attention. {holder.title} has it now. Move it here?</p>
            <Button type="button" size="sm" className="mt-2" onClick={onMoveHere}>
              Move here
            </Button>
          </div>
        </div>
      )}
      <fieldset>
        <legend className="sr-only">Attention</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ATTENTION_PRESETS.map(option => {
            const selected = preset === option;
            return (
              <label key={option} className="relative block cursor-pointer">
                <input
                  type="radio"
                  name={name}
                  value={option}
                  checked={selected}
                  onChange={() => onPick(option)}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-prism-13 p-[13px] peer-focus-visible:shadow-[0_0_0_1.5px_#0B5A80,0_0_0_5.5px_rgba(39,170,225,0.32)]",
                    selected ? "bg-prism-nav-tint ring-[1.5px] ring-prism-nav" : "prism-well"
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "block w-full max-w-[96px] truncate rounded-full bg-white px-2 py-1 text-center text-prism-meta text-prism-ink",
                      PREVIEW_CLASS[option]
                    )}
                  >
                    {option === "off" ? "Off" : label}
                  </span>
                  <span className="text-prism-meta font-semibold text-prism-ink">
                    {ATTENTION_LABELS[option]}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <p className={helperClass}>
        Plays when the block comes into view, then every 8 seconds, 3 times in all. Uses your button
        color.
      </p>
    </>
  );
}

export function MotionFields({
  motion,
  onSave,
}: {
  motion: BlockMotion | undefined;
  onSave: (motion: BlockMotion) => void;
}) {
  const name = useId();
  const entrance = motion?.entrance ?? true;
  const style = motion?.style ?? "theme";
  return (
    <>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={entrance}
          onChange={event => onSave({ entrance: event.target.checked, style })}
          className="mt-0.5 h-5 w-5 shrink-0 accent-prism-nav"
        />
        <span className="min-w-0">
          <span className="block text-prism-label text-prism-ink">
            Entrance when the block comes into view
          </span>
          <span className={cn("block", helperClass)}>Plays once per visit.</span>
        </span>
      </label>
      <fieldset disabled={!entrance} className="disabled:opacity-60">
        <legend className="mb-2 text-prism-label font-semibold text-prism-ink">
          Entrance style
        </legend>
        <div className="flex flex-wrap gap-2">
          {ENTRANCE_STYLES.map(option => {
            const selected = style === option;
            return (
              <label key={option} className="relative cursor-pointer">
                <input
                  type="radio"
                  name={name}
                  value={option}
                  checked={selected}
                  onChange={() => onSave({ entrance, style: option })}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    "inline-flex h-touch items-center rounded-full px-[13px] text-prism-label text-prism-ink peer-focus-visible:shadow-[0_0_0_1.5px_#0B5A80,0_0_0_5.5px_rgba(39,170,225,0.32)]",
                    selected
                      ? "bg-prism-nav-tint font-semibold ring-[1.5px] ring-prism-nav"
                      : "prism-well"
                  )}
                >
                  {ENTRANCE_LABELS[option]}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <p className={helperClass}>
        Motion follows your theme. It stops for visitors who turn on reduce motion, and on slow
        phones.
      </p>
    </>
  );
}

export function BlockSettingsFields({
  block,
  title,
  onChange,
  attentionHolder,
  onClearAttention,
  lockable,
  gated,
  onGatedChange,
}: {
  block: BlockType;
  /** The block's title, drawn in the attention previews */
  title: string;
  onChange: ConfigChange;
  attentionHolder: AttentionHolder | null;
  /** Clears attention on another block in the editor state */
  onClearAttention: (id: number) => void;
  lockable: boolean;
  gated: boolean;
  onGatedChange: (gated: boolean) => void;
}) {
  const [openRow, setOpenRow] = useState<RowId | null>(null);
  const settings = block.config as BlockSettings;
  const preset = attentionOf(block);
  const holder = attentionHolder && attentionHolder.id !== block.id ? attentionHolder : null;

  const toggle = (row: RowId) => setOpenRow(current => (current === row ? null : row));
  const update = (patch: Partial<BlockSettings>) => onChange(mergeSettings(block.config, patch));

  const pickAttention = (next: AttentionPreset) => {
    // One block asks for attention: picking a preset here moves it from the other
    if (next !== "off" && holder) onClearAttention(holder.id);
    update({ attention: next === "off" ? undefined : { preset: next } });
  };

  return (
    <section
      aria-label="Block settings"
      className="mt-[21px] space-y-1 border-t border-prism-line pt-[13px]"
    >
      <p className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2">
        <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-nav" />
        Block settings
      </p>

      <div className="divide-y divide-prism-line">
        <SettingsRow
          icon={<CalendarClock aria-hidden className={iconClass} />}
          label="Schedule"
          value={scheduleSummary(settings.schedule)}
          open={openRow === "schedule"}
          onToggle={() => toggle("schedule")}
        >
          <ScheduleFields schedule={settings.schedule} onSave={schedule => update({ schedule })} />
        </SettingsRow>

        {lockable ? (
          <BlockAccessFields
            embedded
            blockId={block.id}
            gated={gated}
            onGatedChange={onGatedChange}
            open={openRow === "access"}
            onOpenChange={open => setOpenRow(open ? "access" : null)}
          />
        ) : (
          <ReadOnlyRow
            icon={<Lock aria-hidden className={iconClass} />}
            label="Who can open this"
            value={
              MESSAGING_TYPES.includes(block.type)
                ? "Set in Inbox settings"
                : // Gating is off for this page: lockable blocks are open to everyone
                  (LOCKABLE_BLOCK_TYPES as readonly string[]).includes(block.type)
                  ? "Everyone"
                  : "Not available on this block"
            }
          />
        )}

        <SettingsRow
          icon={<Sparkles aria-hidden className={iconClass} />}
          label="Attention"
          value={ATTENTION_LABELS[preset]}
          open={openRow === "attention"}
          onToggle={() => toggle("attention")}
        >
          <AttentionFields
            preset={preset}
            label={title}
            holder={holder}
            onPick={pickAttention}
            onMoveHere={() => {
              onClearAttention(holder!.id);
              update({ attention: { preset: holder!.preset } });
            }}
          />
        </SettingsRow>

        <SettingsRow
          icon={<WandSparkles aria-hidden className={iconClass} />}
          label="Motion"
          value={motionSummary(settings.motion)}
          open={openRow === "motion"}
          onToggle={() => toggle("motion")}
        >
          <MotionFields motion={settings.motion} onSave={motion => update({ motion })} />
        </SettingsRow>
      </div>
    </section>
  );
}
