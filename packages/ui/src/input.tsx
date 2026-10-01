import React, { forwardRef, useId } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "./utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  leftText?: string;
  pattern?: string;
  error?: string;
  // Helper text shown under the field when there is no error
  helper?: string;
  // Classes for the outer wrapper; `className` still goes on the field itself
  containerClassName?: string;
}

// Prism form field: label 16/20 600 above, G2 input well 44 high r13, helper
// 13/16 below, error 13/16 danger with an icon, linked by aria-describedby.
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { label, leftText, pattern, error, helper, id, className, containerClassName, ...props },
    ref
  ) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const noteId = `${inputId}-note`;
    const note = error || helper;

    const field = (
      <input
        id={inputId}
        className={cn(
          "h-touch min-w-0 flex-1 bg-transparent px-3 font-prism text-prism-label text-prism-ink tabular-nums placeholder:text-prism-ink-3 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60",
          !leftText && "w-full",
          className
        )}
        pattern={pattern}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        ref={ref}
        {...props}
      />
    );

    return (
      <div className={cn("space-y-2", containerClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className="block font-prism text-prism-label font-semibold text-prism-ink"
          >
            {label}
          </label>
        )}
        <div
          className={cn(
            "prism-well flex items-center overflow-hidden transition-shadow duration-prism-hover ease-prism",
            "focus-within:shadow-[inset_0_2px_4px_rgba(22,21,43,0.07),0_0_0_1.5px_#0B5A80,0_0_0_5.5px_rgba(39,170,225,0.32)]",
            error && "shadow-[inset_0_2px_4px_rgba(22,21,43,0.07),inset_0_0_0_1.5px_#B3261E]"
          )}
        >
          {leftText && (
            <span className="flex h-touch items-center border-r border-prism-line pl-3 pr-2 font-prism text-prism-label text-prism-ink-2">
              {leftText}
            </span>
          )}
          {field}
        </div>
        {error ? (
          <p
            id={noteId}
            className="flex items-start gap-1.5 font-prism text-prism-meta text-prism-danger"
          >
            <AlertCircle className="mt-px h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : helper ? (
          <p id={noteId} className="font-prism text-prism-meta text-prism-ink-2">
            {helper}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";
