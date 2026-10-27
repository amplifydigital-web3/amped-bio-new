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
