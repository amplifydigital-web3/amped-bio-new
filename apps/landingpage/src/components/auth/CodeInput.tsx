"use client";

import { forwardRef } from "react";
import { OTPInput, REGEXP_ONLY_DIGITS } from "input-otp";
import { cn } from "@repo/ui";

// One time code group (Screen Review 014 I03): six G2 wells 44 x 44, r13, 8
// apart, 20/23 700 tabular digits. One real input underneath carries the
// label, one-time-code autofill and paste of the whole code.
export const CodeInput = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (value: string) => void;
    onComplete?: (value: string) => void;
    disabled?: boolean;
    describedBy?: string;
    invalid?: boolean;
  }
>(function CodeInput({ value, onChange, onComplete, disabled, describedBy, invalid }, ref) {
  return (
    <OTPInput
      ref={ref}
      maxLength={6}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      disabled={disabled}
      autoFocus
      inputMode="numeric"
      pattern={REGEXP_ONLY_DIGITS}
      autoComplete="one-time-code"
      pushPasswordManagerStrategy="none"
      pasteTransformer={pasted => pasted.replace(/\D/g, "").slice(0, 6)}
      aria-label="Authentication code, 6 digits"
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      containerClassName="flex justify-center"
      render={({ slots }) => (
        <div className="flex gap-2" aria-hidden>
          {slots.map((slot, index) => (
            <div
              key={index}
              className={cn(
                "prism-well relative flex h-touch w-touch items-center justify-center font-prism text-prism-panel-title tabular-nums text-prism-ink",
                slot.isActive && "shadow-[0_0_0_1.5px_#0B5A80,0_0_0_5.5px_rgba(39,170,225,0.32)]",
                invalid && !slot.isActive && "shadow-[0_0_0_1.5px_#B3261E]",
                disabled && "opacity-40"
              )}
            >
              {slot.char}
              {slot.hasFakeCaret && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="h-5 w-px animate-pulse bg-prism-ink motion-reduce:animate-none" />
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    />
  );
});
