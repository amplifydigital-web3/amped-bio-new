import { isValid, parseISO, subDays } from "date-fns";

// Authbase sends UTC midnight dates, so they format in UTC: the day Authbase
// set reads the same in every time zone.
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Authbase ISO dates as d MMM yyyy (104 I05). An unreadable date reads as a dash. */
export function authbaseDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? parseISO(value) : value;
  return isValid(date) ? DAY_MONTH_YEAR.format(date) : "-";
}

/** 104 I07: renewal opens 30 days before valid until. */
export function renewalOpensAt(validUntil: string | null | undefined): Date | null {
  if (!validUntil) return null;
  const date = parseISO(validUntil);
  return isValid(date) ? subDays(date, 30) : null;
}
