import { useId } from "react";

// Theme Engine v2 parameter strip (spec 3.10): a labeled slider with its value
// as visitors read it. Native range input, 44 tall, arrow keys step by `step`.

export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  valueText,
  disabled = false,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** What the value line reads, e.g. "160 degrees" */
  valueText: string;
  disabled?: boolean;
  /** One line under the slider */
  hint?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const hintId = useId();
  return (
    <div className="space-y-1 font-prism">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-prism-label font-semibold text-prism-ink">
          {label}
        </label>
        <span aria-hidden className="text-prism-meta tabular-nums text-prism-ink-2">
          {valueText}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={valueText}
        aria-describedby={hint ? hintId : undefined}
        onChange={event => onChange(Number(event.target.value))}
        className="prism-focus h-touch w-full cursor-pointer accent-prism-nav disabled:cursor-not-allowed disabled:opacity-40"
      />
      {hint && (
        <p id={hintId} className="text-prism-meta text-prism-ink-2">
          {hint}
        </p>
      )}
    </div>
  );
}
