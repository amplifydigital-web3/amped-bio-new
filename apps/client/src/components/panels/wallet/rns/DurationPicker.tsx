import { Minus, Plus } from "lucide-react";
import { ChipGroup } from "@repo/ui";
import { formatRnsDate, formatTerm, termRules, termSeconds, type Term } from "./format";

/**
 * Screen Review 078 I02 (shared with 080): four preset chips from the
 * contract minimum, a 44 stepper by the minimum unit up to 5 years, and the
 * expiry date that moves with each change.
 */
export function DurationPicker({
  minSeconds,
  value,
  onChange,
  fromSeconds,
  label = "Duration",
  hint,
}: {
  minSeconds: bigint;
  value: Term;
  onChange: (term: Term) => void;
  /** The term starts here (now for a new name, the current expiry to extend) */
  fromSeconds: number;
  label?: string;
  /** Meta on the right of the label, for example "Shortest is 1 month" (080 I02) */
  hint?: string;
}) {
  const rules = termRules(minSeconds);
  const expires = fromSeconds + Number(termSeconds(value));
  const step = (delta: number) =>
    onChange({
      unit: rules.unit,
      count: Math.min(rules.max, Math.max(rules.min, value.count + delta)),
    });
  const presetValue = rules.presets.includes(value.count) ? String(value.count) : "";

  return (
    <div className="space-y-3 font-prism">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p id="rns-duration-label" className="text-prism-label font-bold text-prism-ink">
          {label}
        </p>
        {hint && <p className="text-prism-meta text-prism-ink-2">{hint}</p>}
      </div>
      <ChipGroup<string>
        label={label}
        value={presetValue}
        onChange={next => onChange({ unit: rules.unit, count: Number(next) })}
        options={rules.presets.map(count => ({
          value: String(count),
          label: formatTerm({ unit: rules.unit, count }),
        }))}
        className="grid grid-cols-2 sm:flex sm:flex-nowrap [&>button]:justify-center sm:[&>button]:flex-1 sm:[&>button]:px-3"
      />
      <div className="prism-slab flex items-center gap-3 !rounded-prism-21 p-2">
        <button
          type="button"
          aria-label="Shorter"
          disabled={value.count <= rules.min}
          onClick={() => step(-1)}
          className="prism-icon-btn prism-focus prism-btn-disabled shrink-0"
        >
          <Minus aria-hidden className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-center" aria-live="polite">
          <p className="text-prism-panel-title tabular-nums text-prism-ink">{formatTerm(value)}</p>
          <p className="text-prism-meta tabular-nums text-prism-ink-2">
            Expires on {formatRnsDate(expires)}
          </p>
        </div>
        <button
          type="button"
          aria-label="Longer"
          disabled={value.count >= rules.max}
          onClick={() => step(1)}
          className="prism-icon-btn prism-focus prism-btn-disabled shrink-0"
        >
          <Plus aria-hidden className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
