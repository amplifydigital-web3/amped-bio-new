/**
 * Due times for Safety cases (adult content review 8.1). Business days skip
 * Saturday and Sunday in UTC; holidays are not counted yet (open question for
 * the safety lead, Q6).
 */
import { SAFETY_CASE_DEFAULTS, type SafetyCaseType, type SafetyDue } from "@repo/constants";

export function addBusinessDays(from: Date, days: number): Date {
  const out = new Date(from.getTime());
  let left = days;
  while (left > 0) {
    out.setUTCDate(out.getUTCDate() + 1);
    const day = out.getUTCDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return out;
}

export function dueFrom(from: Date, due: SafetyDue): Date {
  return "hours" in due
    ? new Date(from.getTime() + due.hours * 3_600_000)
    : addBusinessDays(from, due.businessDays);
}

export function caseDueAt(type: SafetyCaseType, from: Date = new Date()): Date {
  return dueFrom(from, SAFETY_CASE_DEFAULTS[type].due);
}
