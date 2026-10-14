import { useId, useRef, useState } from "react";
import { AlertCircle, Check, Info } from "lucide-react";
import { Tooltip, cn } from "@repo/ui";
import { COPY, CREATOR_SHARE_PRESETS, shareHelper } from "./copy";

type Option = number | "custom";

/**
 * Screen Review 065 I04: Creator share as preset chips 0, 3, 5 (default) and
 * 10 plus Custom (0 to 100). A radiogroup with arrow key movement. Custom
 * reveals a whole number well with a % unit pill.
 */
export function CreatorShareField({
  value,
  onChange,
  error,
}: {
  // NaN while the custom well is empty or invalid
  value: number;
  onChange: (value: number) => void;
  error?: string;
}) {
  const labelId = useId();
  const helperId = useId();
  const errorId = useId();
  const customId = useId();
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const customRef = useRef<HTMLInputElement>(null);
  const [custom, setCustom] = useState(() => !CREATOR_SHARE_PRESETS.includes(value));
  const [customText, setCustomText] = useState(() =>
    CREATOR_SHARE_PRESETS.includes(value) ? "" : String(value)
  );

  const options: Option[] = [...CREATOR_SHARE_PRESETS, "custom"];
  const selected: Option = custom ? "custom" : value;
  const valid = Number.isInteger(value) && value >= 0 && value <= 100;

  const pick = (option: Option, focus = false) => {
    if (option === "custom") {
      setCustom(true);
      const start = customText || (valid ? String(value) : "");
      setCustomText(start);
      onChange(start === "" ? Number.NaN : Number(start));
      if (focus) chipRefs.current[options.length - 1]?.focus();
      else requestAnimationFrame(() => customRef.current?.focus());
      return;
    }
    setCustom(false);
    onChange(option);
    if (focus) chipRefs.current[options.indexOf(option)]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const last = options.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = index === last ? 0 : index + 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index === 0 ? last : index - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    pick(options[next], true);
  };

  return (
    <div className="space-y-2 font-prism">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <span id={labelId} className="text-prism-label font-semibold text-prism-ink">
            Creator share
          </span>
          <Tooltip content={COPY.shareInfo}>
            <button
              type="button"
              aria-label={COPY.shareInfo}
              className="prism-focus inline-flex h-touch w-touch items-center justify-center rounded-full text-prism-ink-2"
            >
              <Info aria-hidden className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>
        <span className="text-prism-meta text-prism-ink-2">0 to 100%</span>
      </div>

      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={helperId}
        className="flex flex-wrap gap-2"
      >
        {options.map((option, index) => {
          const isSelected = selected === option;
          return (
            <button
              key={String(option)}
              ref={node => {
                chipRefs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => pick(option)}
              onKeyDown={event => onKeyDown(event, index)}
              className={cn(
                "prism-focus inline-flex h-touch items-center gap-1.5 rounded-full px-4 text-prism-label tabular-nums",
                isSelected ? "prism-lens-thumb" : "prism-chip"
              )}
            >
              {isSelected && <Check aria-hidden className="h-4 w-4" />}
              {option === "custom" ? "Custom" : `${option}%`}
            </button>
          );
        })}
      </div>

      {custom && (
        <div className="space-y-1">
          <label htmlFor={customId} className="sr-only">
            Custom creator share, whole number from 0 to 100
          </label>
          <div
            className={cn(
              "prism-well flex w-[144px] items-center gap-2 pl-3 pr-1 focus-within:shadow-[0_0_0_1.5px_#0B5A80,0_0_0_5.5px_rgba(39,170,225,0.32)]",
              error && "shadow-[inset_0_0_0_1.5px_#B3261E]"
            )}
          >
            <input
              ref={customRef}
              id={customId}
              inputMode="numeric"
              autoComplete="off"
              value={customText}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : helperId}
              onChange={event => {
                const text = event.target.value.replace(/[^\d]/g, "").slice(0, 3);
                setCustomText(text);
                onChange(text === "" ? Number.NaN : Number(text));
              }}
              className="h-touch min-w-0 flex-1 bg-transparent text-prism-label tabular-nums text-prism-ink focus:outline-none"
            />
            <span className="inline-flex h-9 items-center rounded-full bg-white px-3 text-prism-label font-bold text-prism-ink shadow-[inset_0_0_0_1px_rgba(22,21,43,0.12)]">
              %
            </span>
          </div>
        </div>
      )}

      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-prism-meta text-prism-danger">
          <AlertCircle aria-hidden className="h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}
      <p id={helperId} className="text-prism-meta text-prism-ink-2">
        {valid ? shareHelper(value) : "You cannot change the creator share after launch."}
      </p>
    </div>
  );
}
