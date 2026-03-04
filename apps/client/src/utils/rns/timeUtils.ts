import { format, addSeconds } from "date-fns";

export const SECONDS_IN_MINUTE = 60;
export const SECONDS_IN_HOUR = 3600;
export const SECONDS_IN_DAY = 86400;
export const SECONDS_IN_MONTH = 2592000;
export const SECONDS_IN_YEAR = 31536000;

export type DurationUnit = "minute" | "hour" | "day" | "month" | "year";

export function getDurationUnitFromSeconds(seconds: number): DurationUnit {
  if (seconds >= SECONDS_IN_YEAR) {
    return "year";
  } else if (seconds >= SECONDS_IN_MONTH) {
    return "month";
  } else if (seconds >= SECONDS_IN_DAY) {
    return "day";
  } else if (seconds >= SECONDS_IN_HOUR) {
    return "hour";
  } else {
    return "minute";
  }
}

export function getStepForUnit(unit: DurationUnit): bigint {
  const steps = {
    minute: BigInt(SECONDS_IN_MINUTE),
    hour: BigInt(SECONDS_IN_HOUR),
    day: BigInt(SECONDS_IN_DAY),
    month: BigInt(SECONDS_IN_MONTH),
    year: BigInt(SECONDS_IN_YEAR),
  };
  return steps[unit];
}

export function getMaxDurationForUnit(unit: DurationUnit): bigint {
  const maxes = {
    minute: BigInt(SECONDS_IN_DAY * 7),
    hour: BigInt(SECONDS_IN_DAY * 30),
    day: BigInt(SECONDS_IN_YEAR * 2),
    month: BigInt(SECONDS_IN_YEAR * 5),
    year: BigInt(SECONDS_IN_YEAR * 5),
  };
  return maxes[unit];
}

export function formatDuration(seconds: number): string {
  const years = seconds / SECONDS_IN_YEAR;
  const months = seconds / SECONDS_IN_MONTH;
  const days = seconds / SECONDS_IN_DAY;
  const hours = seconds / SECONDS_IN_HOUR;
  const minutes = seconds / SECONDS_IN_MINUTE;

  if (years >= 1) {
    return `${years.toFixed(1)} ${years === 1 ? "year" : "years"}`;
  } else if (months >= 1) {
    return `${months.toFixed(1)} ${months === 1 ? "month" : "months"}`;
  } else if (days >= 1) {
    return `${days.toFixed(1)} ${days === 1 ? "day" : "days"}`;
  } else if (hours >= 1) {
    return `${hours.toFixed(1)} ${hours === 1 ? "hour" : "hours"}`;
  } else {
    return `${minutes.toFixed(0)} ${Math.floor(minutes) === 1 ? "minute" : "minutes"}`;
  }
}

export function getExpiryDate(seconds: number): string {
  const expiryDate = addSeconds(new Date(), seconds);
  return format(expiryDate, "MMMM d, yyyy");
}
