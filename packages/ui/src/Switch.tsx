"use client";
import { useId } from "react";
import { cn } from "./utils";

/**
 * Prism Switch (Prism 2.2 v1.1, Screen Review 108 D1). For settings that
 * apply at once under autosave; the checkbox stays for agreements and form
 * choices. 44 x 26 track in a 44 target. Off: white track with a 1.5px
 * rgba(22,21,43,0.56) ring and an ink-2 knob (3.70:1 on the worst glass). On:
 * nav track with a white knob. 233ms, none under reduced motion.
 *
 * With `label` the whole 44 row toggles; `description` is the helper line,
 * announced through aria-describedby.
 */
interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Kept for older callers. Every Prism switch is one size. */
  size?: "sm" | "md" | "lg";
  label?: string;
  description?: string;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-controls"?: string;
}

export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  id,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-controls": ariaControls,
}: SwitchProps) {
  const autoId = useId();
  const switchId = id ?? `switch-${autoId}`;
  const labelId = `${switchId}-label`;
  const helpId = `${switchId}-help`;

  const track = (
    <button
      id={switchId}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ? undefined : ariaLabel}
      aria-labelledby={label ? labelId : ariaLabelledBy}
      aria-describedby={description ? helpId : ariaDescribedBy}
      aria-controls={ariaControls}
      disabled={disabled}
      onClick={event => {
        event.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
      className={cn(
        "prism-focus relative inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-full",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "relative block h-[26px] w-[44px] rounded-full transition-colors duration-prism-control ease-prism motion-reduce:transition-none",
          checked ? "bg-prism-nav" : "bg-white shadow-[inset_0_0_0_1.5px_rgba(22,21,43,0.56)]"
        )}
      >
        <span
          className={cn(
            "absolute left-[4px] top-[4px] block h-[18px] w-[18px] rounded-full transition-transform duration-prism-control ease-prism motion-reduce:transition-none",
            checked ? "translate-x-[18px] bg-white" : "translate-x-0 bg-prism-ink-2"
          )}
        />
      </span>
    </button>
  );

  if (!label) return <span className={cn("inline-flex", className)}>{track}</span>;

  return (
    <div
      className={cn(
        "flex min-h-touch items-center gap-[13px] font-prism",
        !disabled && "cursor-pointer",
        className
      )}
      onClick={() => !disabled && onChange(!checked)}
    >
      <div className="min-w-0 flex-1 py-2">
        <span
          id={labelId}
          className={cn(
            "block text-prism-label font-semibold",
            disabled ? "text-prism-ink-3" : "text-prism-ink"
          )}
        >
          {label}
        </span>
        {description && (
          <span id={helpId} className="mt-0.5 block text-prism-meta text-prism-ink-2">
            {description}
          </span>
        )}
      </div>
      {track}
    </div>
  );
}
