import { EXPIRE_ORDER_MESSAGE } from "@repo/constants";

// Block settings, Schedule (Build Board #54). The editor shows wall time in the
// schedule's zone and stores UTC. These helpers never use the browser offset,
// so a creator whose saved zone differs from the browser still edits in the
// saved zone.

/** A datetime-local value: YYYY-MM-DDTHH:mm */
export type WallTime = string;

const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const FUTURE_MESSAGE = "Pick a time in the future";

/** The browser zone, used when a creator first sets a time */
export function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string) {
  let formatter = formatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(zone, formatter);
  }
  return formatter;
}

/** The wall clock in `zone` at instant `ms`, read as if it were UTC (ms) */
function wallMsAt(ms: number, zone: string): number {
  const parts = formatterFor(zone).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(part => part.type === type)?.value ?? 0);
  const hour = get("hour") % 24;
  return Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"));
}

function parseWall(wall: WallTime): number | null {
  const match = WALL.exec(wall);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const ms = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(ms);
  // Rejects dates such as 31 February
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return ms;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatWall(ms: number): WallTime {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(
    d.getUTCHours()
  )}:${pad(d.getUTCMinutes())}`;
}

/** The UTC ISO instant as wall time in `zone`, for a datetime-local input */
export function utcToZonedWall(iso: string, zone: string): WallTime {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return formatWall(wallMsAt(ms, zone));
}

export type ZonedInstant = {
  /** UTC ISO instant */
  iso: string;
  /** The wall time did not exist (spring forward) and moved to the next valid minute */
  shifted: boolean;
};

/**
 * Wall time in `zone` as a UTC instant. A repeated wall time (fall back)
 * takes the first occurrence. A wall time that does not exist (spring
 * forward) moves to the next valid minute.
 */
export function zonedWallToUtc(wall: WallTime, zone: string): ZonedInstant | null {
  const base = parseWall(wall);
  if (base === null) return null;
  // Offsets either side cover any transition near this wall time
  const offsets = new Set([base - DAY, base, base + DAY].map(ms => wallMsAt(ms, zone) - ms));
  const candidates = [...offsets].map(offset => base - offset);
  const exact = candidates.filter(ms => wallMsAt(ms, zone) === base);
  if (exact.length > 0) {
    return { iso: new Date(Math.min(...exact)).toISOString(), shifted: false };
  }
  // In a gap: the first minute whose wall time is at or after the input
  let low = Math.min(...candidates);
  let high = Math.max(...candidates);
  while (high - low > MINUTE) {
    const mid = low + Math.floor((high - low) / 2 / MINUTE) * MINUTE;
    if (wallMsAt(mid, zone) >= base) high = mid;
    else low = mid;
  }
  return { iso: new Date(high).toISOString(), shifted: true };
}

export type ScheduleErrors = { start?: string; end?: string };

/**
 * Go live may be in the past (live now). Expire must be after Go live and in
 * the future. Wall times are read in `zone`.
 */
export function scheduleErrors(
  startWall: WallTime,
  endWall: WallTime,
  zone: string,
  now: Date = new Date()
): ScheduleErrors {
  const errors: ScheduleErrors = {};
  const start = startWall ? zonedWallToUtc(startWall, zone) : null;
  const end = endWall ? zonedWallToUtc(endWall, zone) : null;
  if (startWall && !start) errors.start = "Enter a date and time";
  if (endWall && !end) errors.end = "Enter a date and time";
  if (start && end && Date.parse(end.iso) <= Date.parse(start.iso)) {
    errors.end = EXPIRE_ORDER_MESSAGE;
  } else if (end && Date.parse(end.iso) <= now.getTime()) {
    errors.end = FUTURE_MESSAGE;
  }
  return errors;
}
