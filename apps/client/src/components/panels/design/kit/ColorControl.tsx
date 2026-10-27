import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { cn, parseHex, toHex } from "@repo/ui";

// Screen Review 025 I03. The shared color control for every Style row: a G2
// input well with a 44 swatch button that opens the system picker and a hex
// field; Your colors below lists up to 6 colors already in the theme.

export function ColorControl({
  label,
  value,
  onChange,
  yourColors = [],
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  yourColors?: string[];
  disabled?: boolean;
}) {
  const id = useId();
  const errorId = useId();
  const pickerRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value.toUpperCase());
  const [error, setError] = useState(false);

  useEffect(() => {
    setDraft(value.toUpperCase());
    setError(false);
  }, [value]);

  const commit = (text: string) => {
    const rgb = parseHex(text);
    if (!rgb || !/^#?[0-9a-f]{6}$/i.test(text.trim())) {
      setError(true);
      return;
    }
    const hex = toHex(rgb);
    setError(false);
    setDraft(hex);
    if (hex !== value.toUpperCase()) onChange(hex);
  };

  const swatches = Array.from(
    new Set(yourColors.map(c => (parseHex(c) ? toHex(parseHex(c)!) : null)).filter(Boolean))
  ).slice(0, 6) as string[];

  return (
    <div className="space-y-2 font-prism">
      <label htmlFor={id} className="block text-prism-label font-semibold text-prism-ink">
        {label}
      </label>
      <div className="prism-well flex h-touch items-center gap-2 pr-3">
        <button
          type="button"
          disabled={disabled}
          aria-label="Open color picker"
          onClick={() => pickerRef.current?.click()}
          className="prism-focus ml-0 h-touch w-touch shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(22,21,43,0.18)] disabled:cursor-not-allowed"
          style={{ backgroundColor: parseHex(value) ? value : "transparent" }}
        />
        <input
          ref={pickerRef}
          type="color"
          tabIndex={-1}
          aria-hidden
          disabled={disabled}
          value={parseHex(value) ? toHex(parseHex(value)!).toLowerCase() : "#000000"}
          onChange={event => onChange(event.target.value.toUpperCase())}
          className="sr-only"
        />
        <input
          id={id}
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={draft}
          aria-invalid={error || undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={event => setDraft(event.target.value)}
          onBlur={event => commit(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter") commit((event.target as HTMLInputElement).value);
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-prism-label uppercase tabular-nums text-prism-ink outline-none disabled:cursor-not-allowed"
        />
      </div>
      {error && (
        <p id={errorId} className="flex items-center gap-1.5 text-prism-meta text-prism-danger">
          <AlertCircle aria-hidden className="h-[21px] w-[21px] shrink-0" />
          Use 6 hex digits, for example #FFFFFF
        </p>
      )}
      {swatches.length > 0 && (
        <div className="space-y-1">
          <p className="text-prism-meta text-prism-ink-2">Your colors</p>
          <div className="flex flex-wrap gap-2">
            {swatches.map(color => {
              const match = color === value.toUpperCase();
              return (
                <button
                  key={color}
                  type="button"
                  disabled={disabled}
                  aria-label={`Use ${color}`}
                  aria-pressed={match}
                  onClick={() => onChange(color)}
                  className={cn(
                    "prism-focus h-touch w-touch rounded-full disabled:cursor-not-allowed",
                    match
                      ? "shadow-[0_0_0_1.5px_#5650A2]"
                      : "shadow-[inset_0_0_0_1px_rgba(22,21,43,0.18)]"
                  )}
                  style={{ backgroundColor: color }}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
