import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@repo/ui";

// Screen Review design option tiles convention (023 to 030): r13 art, 1px rest
// ring, label below always visible; selected adds the 1.5px indigo ring, the
// 4px tint ring and a 21 check badge. Tiles are radios in one radiogroup with
// roving tabindex: arrow keys move focus (and preview), Space or Enter selects.

export function OptionGrid({
  label,
  columns = "three",
  children,
  className,
}: {
  label: string;
  /** three: 3 columns at 768 and up, 2 below. four: 4 and 2 (Text row fonts) */
  columns?: "three" | "four";
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key) || !ref.current) return;
    const radios = Array.from(
      ref.current.querySelectorAll<HTMLElement>('[role="radio"]:not([aria-disabled="true"])')
    );
    if (radios.length === 0) return;
    const index = radios.indexOf(document.activeElement as HTMLElement);
    let next = index;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = radios.length - 1;
    else if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (index + 1) % radios.length;
    else next = (index - 1 + radios.length) % radios.length;
    event.preventDefault();
    radios.forEach((radio, i) => (radio.tabIndex = i === next ? 0 : -1));
    radios[next].focus();
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        "grid grid-cols-2 gap-[13px]",
        columns === "four" ? "md:grid-cols-4" : "md:grid-cols-3",
        className
      )}
    >
      {children}
    </div>
  );
}

export function OptionTile({
  label,
  description,
  selected,
  disabled = false,
  focusable,
  onSelect,
  onPreview,
  onPreviewEnd,
  art,
  artClassName = "aspect-video",
  accessibleDescription,
}: {
  label: string;
  /** Second label line (Particles descriptions) */
  description?: string;
  selected: boolean;
  /** Locked theme: shows the value, does not respond (027 I09) */
  disabled?: boolean;
  /** Roving tabindex: the selected tile, or the first when none is selected */
  focusable: boolean;
  onSelect: () => void;
  onPreview?: () => void;
  onPreviewEnd?: () => void;
  art: ReactNode;
  artClassName?: string;
  accessibleDescription?: string;
}) {
  const activate = () => {
    if (!disabled) onSelect();
  };

  return (
    <div
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      aria-label={label}
      aria-description={accessibleDescription}
      tabIndex={focusable ? 0 : -1}
      onClick={activate}
      onKeyDown={event => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          activate();
        }
      }}
      onPointerEnter={disabled ? undefined : onPreview}
      onPointerLeave={disabled ? undefined : onPreviewEnd}
      onFocus={disabled ? undefined : onPreview}
      onBlur={disabled ? undefined : onPreviewEnd}
      className={cn(
        "group min-w-0 cursor-pointer rounded-prism-13 outline-none",
        disabled && "cursor-default"
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-prism-13 transition-shadow duration-prism-hover ease-prism",
          artClassName,
          selected
            ? "shadow-[0_0_0_1.5px_#5650A2,0_0_0_5.5px_rgba(86,80,162,0.14)]"
            : "shadow-[inset_0_0_0_1px_rgba(22,21,43,0.18)]",
          "group-focus-visible:shadow-[0_0_0_1.5px_#0B5A80,0_0_0_5.5px_rgba(39,170,225,0.32)]"
        )}
      >
        {art}
        {/* ILLUMINATED hover: the top highlight brightens */}
        {!disabled && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.36)_0%,rgba(255,255,255,0)_40%)] opacity-0 transition-opacity duration-prism-hover group-hover:opacity-100 group-active:duration-prism-micro"
          />
        )}
        {selected && (
          <span
            aria-hidden
            className="absolute right-2 top-2 flex h-[21px] w-[21px] items-center justify-center rounded-full bg-prism-nav text-white"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
        )}
      </div>
      <p
        className={cn(
          "mt-2 truncate text-prism-meta",
          selected ? "font-bold text-prism-nav-pressed" : "text-prism-ink-2",
          description && "font-semibold text-prism-ink"
        )}
      >
        {label}
      </p>
      {description && <p className="text-prism-meta text-prism-ink-2">{description}</p>}
    </div>
  );
}
