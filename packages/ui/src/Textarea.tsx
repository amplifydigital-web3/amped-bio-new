import React, { forwardRef, useId } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "./utils";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  leftText?: string;
  error?: string;
  helper?: string;
  // Classes for the outer wrapper; `className` still goes on the field itself
  containerClassName?: string;
}

// Same field anatomy as Input, on a multi-line G2 well.
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, leftText, error, helper, id, className, containerClassName, ...props }, ref) => {
    const autoId = useId();
    const fieldId = id ?? autoId;
    const noteId = `${fieldId}-note`;
    const note = error || helper;

    return (
      <div className={cn("space-y-2", containerClassName)}>
        {label && (
          <label
            htmlFor={fieldId}
            className="block font-prism text-prism-label font-semibold text-prism-ink"
          >
            {label}
          </label>
        )}
        <div
          className={cn(
            "prism-well flex overflow-hidden transition-shadow duration-prism-hover ease-prism",
            "focus-within:shadow-[inset_0_2px_4px_rgba(22,21,43,0.07),0_0_0_1.5px_#0B5A80,0_0_0_5.5px_rgba(39,170,225,0.32)]",
            error && "shadow-[inset_0_2px_4px_rgba(22,21,43,0.07),inset_0_0_0_1.5px_#B3261E]"
          )}
        >
          {leftText && (
            <span className="flex items-start border-r border-prism-line pl-3 pr-2 pt-2.5 font-prism text-prism-label text-prism-ink-2">
              {leftText}
            </span>
          )}
          <textarea
            id={fieldId}
            className={cn(
              "min-h-[88px] w-full flex-1 resize-y bg-transparent px-3 py-2.5 font-prism text-prism-body text-prism-ink placeholder:text-prism-ink-3 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60",
              className
            )}
            aria-invalid={error ? true : undefined}
            aria-describedby={note ? noteId : undefined}
            ref={ref}
            {...props}
          />
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

Textarea.displayName = "Textarea";
