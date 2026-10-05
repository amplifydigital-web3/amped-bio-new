import { forwardRef, useContext, useState } from "react";
import { OTPInputContext } from "input-otp";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@repo/ui";
import { FieldError } from "../page/blocks/LinkFields";
import { wellClass } from "../page/blocks/linkValue";

// Shared pieces of the Account card rows (Screen Review 019 to 021).

/** One 44 x 55 G2 slot of the six digit code field (019 I07, 021 I06). */
export function CodeSlot({
  index,
  invalid,
  disabled,
}: {
  index: number;
  invalid: boolean;
  disabled: boolean;
}) {
  const context = useContext(OTPInputContext);
  const slot = context.slots[index];
  return (
    <div
      className={cn(
        "prism-well relative flex h-commit w-touch items-center justify-center text-prism-panel-title font-bold tabular-nums text-prism-ink",
        !disabled &&
          slot?.isActive &&
          "shadow-[0_0_0_1.5px_#0B5A80,0_0_0_5.5px_rgba(39,170,225,0.32)]",
        invalid && "!shadow-[inset_0_0_0_1.5px_#B3261E]"
      )}
    >
      {slot?.char}
      {!disabled && slot?.hasFakeCaret && (
        <span
          aria-hidden
          className="h-[21px] w-px animate-caret-blink bg-prism-ink motion-reduce:animate-none"
        />
      )}
    </div>
  );
}

/** Cancel then the primary, right aligned; full width with the primary on top on phones (019 I12). */
export function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col-reverse gap-[13px] sm:flex-row sm:items-center sm:justify-end">
      {children}
    </div>
  );
}

/**
 * 021 I13: every password prompt in two factor uses this field. A G2 well 44
 * labeled Confirm your password, a 44 show toggle inside the right edge, and
 * the error under the field.
 */
export const PasswordField = forwardRef<
  HTMLInputElement,
  {
    id: string;
    value: string;
    onChange: (value: string) => void;
    error?: string | null;
    disabled?: boolean;
  }
>(function PasswordField({ id, value, onChange, error, disabled }, ref) {
  const [visible, setVisible] = useState(false);
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-prism-label font-semibold text-prism-ink">
        Confirm your password
      </label>
      <div className={cn(wellClass(!!error), "pr-0")}>
        <input
          ref={ref}
          id={id}
          type={visible ? "text" : "password"}
          autoComplete="current-password"
          autoCapitalize="none"
          spellCheck={false}
          value={value}
          disabled={disabled}
          onChange={event => onChange(event.target.value)}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? errorId : undefined}
          className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink outline-none"
        />
        <button
          type="button"
          onClick={() => setVisible(shown => !shown)}
          aria-pressed={visible}
          aria-label={visible ? "Hide password" : "Show password"}
          className="prism-focus flex h-touch w-touch shrink-0 items-center justify-center rounded-prism-13 text-prism-ink-2 hover:text-prism-ink"
        >
          {visible ? (
            <EyeOff aria-hidden className="h-[21px] w-[21px]" />
          ) : (
            <Eye aria-hidden className="h-[21px] w-[21px]" />
          )}
        </button>
      </div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
});
