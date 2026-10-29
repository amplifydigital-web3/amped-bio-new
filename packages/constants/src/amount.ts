/**
 * Normalizes what the user types into a money amount field.
 * Accepts "," as the decimal separator (the decimal keypad shows "," in many
 * locales), keeps digits and one separator, and rejects input with more than one
 * separator by returning the previous value instead of rewriting it.
 * The flow validates the result against balance.
 */
export function sanitizeAmount(raw: string, previous: string): string {
  const normalized = raw.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  return (normalized.match(/\./g)?.length ?? 0) > 1 ? previous : normalized;
}

/** tREVO (REVO at mainnet) uses 18 decimals, like ether. */
export const TREVO_DECIMALS = 18;

/**
 * A whole number of tokens as typed by a creator ("500") to wei ("500" followed by
 * 18 zeros). Pool stakes are mirrored in wei (`StakedPool.stakeAmount`), so every
 * comparison against a creator's minimum must convert first. Returns null for
 * anything that is not a whole number.
 */
export function wholeTokensToWei(whole: string, decimals: number = TREVO_DECIMALS): string | null {
  if (!/^\d+$/.test(whole)) return null;
  return (BigInt(whole) * 10n ** BigInt(decimals)).toString();
}
