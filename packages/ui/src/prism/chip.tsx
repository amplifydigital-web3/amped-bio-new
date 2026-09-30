import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "../utils";

// Prism chip (section 7): 44 high pill, 16/500 ink-2. Selected: lens thumb,
// indigo 1.5px ring, check icon, raised 1px.
export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ selected = false, className, children, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-pressed={props.role === "radio" ? undefined : selected}
      aria-checked={props.role === "radio" ? selected : undefined}
      className={cn(
        "prism-focus inline-flex h-touch shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-5 font-prism text-prism-label font-medium tabular-nums",
        "transition-[transform,box-shadow,background-color] duration-prism-hover ease-prism motion-reduce:transition-none",
        selected ? "prism-lens-thumb -translate-y-px" : "prism-chip hover:bg-white/70",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {selected && <Check className="h-4 w-4" aria-hidden />}
      {children}
    </button>
  )
);
Chip.displayName = "Chip";

export interface ChipGroupOption<T extends string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
}

// Single choice chip row with radio semantics and arrow key movement.
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: ChipGroupOption<T>[];
  value: T;
  onChange: (value: T) => void;
  // Accessible name for the group
  label: string;
  className?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const move = (from: number, step: number) => {
    const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter(i => i >= 0);
    const pos = enabled.indexOf(from);
    const next = enabled[(pos + step + enabled.length) % enabled.length];
    if (next === undefined) return;
    refs.current[next]?.focus();
    onChange(options[next].value);
  };

  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Chip
            key={option.value}
            ref={el => {
              refs.current[index] = el;
            }}
            role="radio"
            selected={selected}
            disabled={option.disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={event => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                move(index, 1);
              } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                move(index, -1);
              }
            }}
          >
            {option.label}
          </Chip>
        );
      })}
    </div>
  );
}
