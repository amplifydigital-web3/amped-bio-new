import { z } from "zod";

// Block Review v2, Block settings row (Build Board #54, docs/features/
// block-review-v2-existing-blocks-design.md, "Block settings row"). Every block
// config carries the same three settings next to `hidden`: when it shows
// (schedule), whether it asks for attention, and how it enters. Who can open
// it stays on the block row (`accessRuleId`, gating G3).
//
// The settings save only while the blocksV2 flag is on (the server strips them
// otherwise). A saved schedule is always applied on the server, flag on or
// off, so a block never shows early because a flag changed.

export const ATTENTION_PRESETS = ["off", "shimmer", "glow", "pulse", "edge", "pop"] as const;
export type AttentionPreset = (typeof ATTENTION_PRESETS)[number];

export const ATTENTION_LABELS: Record<AttentionPreset, string> = {
  off: "Off",
  shimmer: "Shimmer",
  glow: "Glow",
  pulse: "Pulse",
  edge: "Edge trace",
  pop: "Pop",
};

export const ENTRANCE_STYLES = ["theme", "rise", "fade", "scale"] as const;
export type EntranceStyle = (typeof ENTRANCE_STYLES)[number];

export const ENTRANCE_LABELS: Record<EntranceStyle, string> = {
  theme: "Theme default",
  rise: "Rise",
  fade: "Fade",
  scale: "Scale",
};

/** BS3: plays on view, then every 8 seconds, 3 plays per visit */
export const ATTENTION_INTERVAL_MS = 8000;
export const ATTENTION_PLAYS = 3;
/** Entrance: 377 ms once per visit; Rise moves 13 px */
export const ENTRANCE_MS = 377;
export const ENTRANCE_RISE_PX = 13;

export const ONE_ATTENTION_MESSAGE = "Only one block can ask for attention";
export const EXPIRE_ORDER_MESSAGE = "Expire must be after Go live";

const isoDateTime = z.string().datetime({ offset: true });

/** An IANA zone name such as Europe/Lisbon, checked against the runtime's zone data */
const timeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(zone => isTimeZone(zone), "Unknown time zone");

export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export const blockScheduleSchema = z
  .object({
    /** UTC instant the block goes live. In the past means live now. */
    start: isoDateTime.optional(),
    /** UTC instant the block leaves the page */
    end: isoDateTime.optional(),
    /** The zone the creator edits in (the browser zone when first set) */
    zone: timeZoneSchema,
    /** Before go live, show the label and "Opens in" with no link target */
    showCountdown: z.boolean().default(false),
  })
  .refine(
    schedule =>
      !schedule.start || !schedule.end || Date.parse(schedule.end) > Date.parse(schedule.start),
    { message: EXPIRE_ORDER_MESSAGE, path: ["end"] }
  );

export const blockAttentionSchema = z.object({
  preset: z.enum(ATTENTION_PRESETS).default("off"),
});

export const blockMotionSchema = z.object({
  entrance: z.boolean().default(true),
  style: z.enum(ENTRANCE_STYLES).default("theme"),
});

export type BlockSchedule = z.infer<typeof blockScheduleSchema>;
export type BlockAttention = z.infer<typeof blockAttentionSchema>;
export type BlockMotion = z.infer<typeof blockMotionSchema>;

/** The settings every block config may carry, next to `hidden` */
export type BlockSettings = {
  schedule?: BlockSchedule;
  attention?: BlockAttention;
  motion?: BlockMotion;
};

export const BLOCK_SETTINGS_KEYS = ["schedule", "attention", "motion"] as const;

/** The shape every config schema extends, so zod keeps the settings on save */
export const blockSettingsShape = {
  hidden: z.boolean().optional(),
  schedule: blockScheduleSchema.optional(),
  attention: blockAttentionSchema.optional(),
  motion: blockMotionSchema.optional(),
};

export const blockSettingsSchema = z.object(blockSettingsShape);

/** Adds the shared Block settings to a block's config schema */
export function withBlockSettings<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.extend(blockSettingsShape);
}

/** The config without schedule, attention and motion (the blocksV2 flag is off) */
export function stripBlockSettings<T>(config: T): T {
  if (!config || typeof config !== "object" || Array.isArray(config)) return config;
  const rest = { ...(config as Record<string, unknown>) };
  for (const key of BLOCK_SETTINGS_KEYS) delete rest[key];
  return rest as T;
}

type WithSettings = { config?: unknown } | null | undefined;

function settingsOf(block: WithSettings): BlockSettings {
  const config = block?.config;
  return config && typeof config === "object" ? (config as BlockSettings) : {};
}

export function attentionOf(block: WithSettings): AttentionPreset {
  const preset = settingsOf(block).attention?.preset;
  return preset && (ATTENTION_PRESETS as readonly string[]).includes(preset) ? preset : "off";
}

export function hasAttention(block: WithSettings): boolean {
  return attentionOf(block) !== "off";
}

/** BS2: how many blocks in a page batch ask for attention */
export function attentionCount(blocks: readonly WithSettings[]): number {
  return blocks.filter(hasAttention).length;
}

export type ScheduleState = "live" | "upcoming" | "expired";

/** Where a schedule stands at `now`. No schedule, or no times, is live. */
export function scheduleState(
  schedule: Partial<BlockSchedule> | null | undefined,
  now: Date = new Date()
): ScheduleState {
  if (!schedule) return "live";
  const time = now.getTime();
  const end = schedule.end ? Date.parse(schedule.end) : NaN;
  if (Number.isFinite(end) && time >= end) return "expired";
  const start = schedule.start ? Date.parse(schedule.start) : NaN;
  if (Number.isFinite(start) && time < start) return "upcoming";
  return "live";
}

export type BlockVisibility = "show" | "countdown" | "drop";

/**
 * The server rule (BS1, CD2): what a visitor gets for a block. Hidden,
 * expired and not yet live blocks leave the response, so nothing in the
 * page, its data or a preview can reveal them. A block before go live with
 * Show a countdown leaves as the countdown row, which carries no link
 * target, text or file id.
 */
export function blockVisibility(block: WithSettings, now: Date = new Date()): BlockVisibility {
  const settings = settingsOf(block) as BlockSettings & { hidden?: boolean };
  if (settings.hidden === true) return "drop";
  const state = scheduleState(settings.schedule, now);
  if (state === "live") return "show";
  if (state === "upcoming" && settings.schedule?.showCountdown && countdownLabel(block)) {
    return "countdown";
  }
  return "drop";
}

/** The one text a countdown row may show: the block's label or title */
export function countdownLabel(block: WithSettings): string | null {
  const config = settingsOf(block) as { label?: unknown; title?: unknown };
  const label = typeof config.label === "string" ? config.label.trim() : "";
  if (label) return label.slice(0, 60);
  const title = typeof config.title === "string" ? config.title.trim() : "";
  return title ? title.slice(0, 60) : null;
}

/** What a visitor receives for a block before go live (no URL, body or embed) */
export type ScheduledBlockDto = {
  id: number;
  type: string;
  order: number;
  config: { label: string };
  scheduled: { start: string };
};

export function scheduledBlockDto(block: {
  id: number;
  type: string;
  order: number;
  config: unknown;
}): ScheduledBlockDto | null {
  const label = countdownLabel(block);
  const start = settingsOf(block).schedule?.start;
  if (!label || !start) return null;
  return { id: block.id, type: block.type, order: block.order, config: { label }, scheduled: { start } };
}

// Copy for the row values and the countdown line. Dates read as "Fri 6 Nov"
// in the zone given, with the year when it is not the current year there.

function partsIn(iso: string | Date, zone: string | undefined) {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...(zone ? { timeZone: zone } : {}),
  };
  const parts = new Intl.DateTimeFormat("en-GB", options).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? "";
  return {
    weekday: get("weekday"),
    day: get("day"),
    month: get("month"),
    year: get("year"),
    hour: get("hour"),
    minute: get("minute"),
    dayPeriod: get("dayPeriod").toUpperCase(),
  };
}

/** "Fri 6 Nov", plus the year outside the current year in that zone */
export function formatScheduleDay(iso: string | Date, zone?: string, now: Date = new Date()) {
  const p = partsIn(iso, zone);
  const year = partsIn(now, zone).year;
  return `${p.weekday} ${p.day} ${p.month}${p.year !== year ? ` ${p.year}` : ""}`;
}

/** "8:00 PM" in the zone given */
export function formatScheduleTime(iso: string | Date, zone?: string) {
  const p = partsIn(iso, zone);
  return `${p.hour}:${p.minute} ${p.dayPeriod}`;
}

/** The Schedule row value: Always on, From, Until, a range, or Expired */
export function scheduleSummary(
  schedule: Partial<BlockSchedule> | null | undefined,
  now: Date = new Date()
): string {
  if (!schedule || (!schedule.start && !schedule.end)) return "Always on";
  if (scheduleState(schedule, now) === "expired") return "Expired";
  const zone = schedule.zone;
  const start = schedule.start ? formatScheduleDay(schedule.start, zone, now) : null;
  const end = schedule.end ? formatScheduleDay(schedule.end, zone, now) : null;
  if (start && end) return `${start} to ${end}`;
  if (start) return `From ${start}`;
  return `Until ${end}`;
}

/**
 * The countdown line (CD1): whole days, then hours under 24 hours, then
 * minutes under 1 hour. Never seconds. "Opens in 11 days · Fri 6 Nov, 8:00 PM
 * your time". The caller updates it at most once a minute.
 */
export function countdownLine(start: string, now: Date = new Date(), visitorZone?: string) {
  const ms = Date.parse(start) - now.getTime();
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  let span: string;
  if (minutes < 60) span = `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  else if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    span = `${hours} ${hours === 1 ? "hour" : "hours"}`;
  } else {
    const days = Math.floor(minutes / (24 * 60));
    span = `${days} ${days === 1 ? "day" : "days"}`;
  }
  const day = formatScheduleDay(start, visitorZone, now);
  const time = formatScheduleTime(start, visitorZone);
  return `Opens in ${span} · ${day}, ${time} your time`;
}

/** The Motion row value */
export function motionSummary(motion: Partial<BlockMotion> | null | undefined): string {
  if (motion?.entrance === false) return "Off";
  const style = motion?.style ?? "theme";
  return style === "theme" ? "Entrance on" : ENTRANCE_LABELS[style];
}
