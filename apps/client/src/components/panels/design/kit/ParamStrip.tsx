import { useEffect, useId, useRef, useState } from "react";
import { clampParams, type EffectEntry, type ParamSpec, type ParamValues } from "@repo/constants";
import {
  BottomSheet,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetTrigger,
  Button,
  ChipGroup,
} from "@repo/ui";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { ColorControl } from "./ColorControl";

// Theme Engine v2 editor chrome (spec 3.10, boards 01 and 05): the parameter
// strip under the selected tile, rendered from the entry's ParamSpec. Phones
// get the same controls in a bottom sheet. Changes preview at once and save
// 233 ms after the last one, so a slider drag writes one save, not fifty.

const CHOICE_LABELS: Record<string, string> = {
  original: "Original",
  theme: "Your theme",
  custom: "Custom",
  slow: "Slow",
  medium: "Medium",
  fast: "Fast",
  default: "Default",
};

const SAVE_DELAY_MS = 233;

/** True when the entry has controls to show. */
export function hasParams(entry: EffectEntry): boolean {
  return Object.keys(entry.params).length > 0;
}

/** The custom color shows only while Colors is set to Custom. */
function visible(key: string, spec: ParamSpec, values: ParamValues): boolean {
  if (spec.kind === "color" && "palette" in values) return values["palette"] === "custom";
  return key !== "";
}

function RangeControl({
  spec,
  value,
  disabled,
  onChange,
}: {
  spec: Extract<ParamSpec, { kind: "range" }>;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-prism-label font-semibold text-prism-ink">
          {spec.label}
        </label>
        <span className="text-prism-meta text-prism-ink-2">{value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        disabled={disabled}
        onChange={event => onChange(Number(event.target.value))}
        className="h-touch w-full cursor-pointer accent-prism-nav"
      />
    </div>
  );
}

function TextControl({
  spec,
  value,
  disabled,
  onChange,
}: {
  spec: Extract<ParamSpec, { kind: "text" }>;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const hintId = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-prism-label font-semibold text-prism-ink">
        {spec.label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={spec.maxLength}
        disabled={disabled}
        aria-describedby={hintId}
        onChange={event => onChange(event.target.value)}
        className="prism-well prism-focus h-touch w-full px-[13px] text-[20px] outline-none"
      />
      <p id={hintId} className="text-prism-meta text-prism-ink-2">
        Up to six emoji. Letters and numbers are left out.
      </p>
    </div>
  );
}

export function ParamStrip({
  entry,
  stored,
  disabled = false,
  yourColors,
  onChange,
}: {
  entry: EffectEntry;
  /** The params on the config, clamped here against the entry. */
  stored: ParamValues | undefined;
  disabled?: boolean;
  yourColors?: string[];
  /** Called 233 ms after the last change with the full, clamped set. */
  onChange: (params: Record<string, number | string>) => void;
}) {
  const [values, setValues] = useState(() => clampParams(entry, stored));
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pending = useRef<Record<string, number | string> | null>(null);
  const latest = useRef(onChange);
  latest.current = onChange;

  // A new pick or an outside change (Undo) resets the strip
  const storedKey = JSON.stringify(stored ?? {});
  useEffect(() => {
    setValues(clampParams(entry, stored));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id, storedKey]);

  // Save the last change when the strip closes
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (pending.current) latest.current(pending.current);
    },
    []
  );

  const set = (key: string, value: number | string) => {
    const next = clampParams(entry, { ...values, [key]: value });
    setValues(next);
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      pending.current = null;
      latest.current(next);
    }, SAVE_DELAY_MS);
  };

  return (
    <div className="space-y-[21px]" aria-label={`${entry.label} settings`} role="group">
      {Object.entries(entry.params).map(([key, spec]) => {
        if (!visible(key, spec, values)) return null;
        const value = values[key];
        switch (spec.kind) {
          case "range":
            return (
              <RangeControl
                key={key}
                spec={spec}
                value={Number(value)}
                disabled={disabled}
                onChange={next => set(key, next)}
              />
            );
          case "choice":
            return (
              <div key={key} className="space-y-2">
                <p className="text-prism-label font-semibold text-prism-ink">{spec.label}</p>
                <ChipGroup
                  label={spec.label}
                  value={String(value)}
                  onChange={next => {
                    if (!disabled) set(key, next);
                  }}
                  options={spec.options.map(option => ({
                    value: option,
                    label: CHOICE_LABELS[option] ?? option,
                    disabled,
                  }))}
                />
                {key === "palette" && value === "theme" && (
                  <p className="text-prism-meta text-prism-ink-2">
                    Reads your text, button and card colors.
                  </p>
                )}
              </div>
            );
          case "color":
            return (
              <ColorControl
                key={key}
                label={spec.label}
                value={String(value)}
                yourColors={yourColors}
                disabled={disabled}
                onChange={next => set(key, next)}
              />
            );
          case "text":
            return (
              <TextControl
                key={key}
                spec={spec}
                value={String(value)}
                disabled={disabled}
                onChange={next => set(key, next)}
              />
            );
        }
      })}
    </div>
  );
}

/**
 * The strip in place: a G2 well under the tiles on wider screens, a bottom
 * sheet behind an Adjust button on phones (board 05).
 */
export function ParamPanel(props: Parameters<typeof ParamStrip>[0]) {
  const phone = useMediaQuery(PHONE_QUERY);
  if (!hasParams(props.entry)) return null;
  if (!phone) {
    return (
      <div className="prism-well rounded-prism-21 p-[21px]">
        <ParamStrip {...props} />
      </div>
    );
  }
  return (
    <BottomSheet>
      <BottomSheetTrigger asChild>
        <Button variant="secondary" className="w-full" disabled={props.disabled}>
          Adjust {props.entry.label}
        </Button>
      </BottomSheetTrigger>
      <BottomSheetContent title={`${props.entry.label} settings`}>
        <div className="space-y-[21px] px-[21px] pb-[34px]">
          <ParamStrip {...props} />
          <BottomSheetClose asChild>
            <Button className="w-full">Done</Button>
          </BottomSheetClose>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  );
}
