import { RNS_GRACE_PERIOD_SECONDS } from "@repo/web3";

const DAY = 86_400;

/**
 * RNS name expiry email stages. Each name gets one email per stage for a
 * given registration expiry: 30, 7 and 1 day before it expires, and one when
 * it enters the grace period (1 day, then the name is released).
 */
export const RNS_EXPIRY_STAGES = ["d30", "d7", "d1", "grace"] as const;
export type RnsExpiryStage = (typeof RNS_EXPIRY_STAGES)[number];

/**
 * The stage a name is in now, from its registration expiry (unix seconds).
 * Only the current stage is returned, so a missed sweep never sends a burst of
 * old reminders: a name found 5 days out gets the 7 day email only.
 */
export function rnsExpiryStage(expiry: number, now: number): RnsExpiryStage | null {
  const left = expiry - now;
  if (left > 30 * DAY) return null;
  if (left > 7 * DAY) return "d30";
  if (left > DAY) return "d7";
  if (left > 0) return "d1";
  if (now < expiry + RNS_GRACE_PERIOD_SECONDS) return "grace";
  return null;
}

/** Days left, rounded up, for the email copy. At least 1 while not expired. */
export function rnsDaysLeft(expiry: number, now: number): number {
  return Math.max(1, Math.ceil((expiry - now) / DAY));
}

/** The subject line for a stage. */
export function rnsExpirySubject(
  name: string,
  stage: RnsExpiryStage,
  expiry: number,
  now: number
): string {
  if (stage === "grace") return `${name} has expired. Renew it by tomorrow to keep it`;
  const days = rnsDaysLeft(expiry, now);
  return `Your RNS name ${name} expires in ${days} ${days === 1 ? "day" : "days"}`;
}
