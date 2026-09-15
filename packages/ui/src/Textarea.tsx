import React, { forwardRef } from "react";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  leftText?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, leftText, error, ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}
        {leftText && (
          <div
            className={`flex overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 focus-within:rounded-md ${error ? "border-red-500" : ""}`}
          >
            <div className="flex items-center px-3 border-t border-b border-l border-gray-300 rounded-md rounded-r-none text-gray-500 bg-gray-50">
              {leftText}
            </div>
            <textarea
              className={`flex-1 px-3 py-2 border rounded-md rounded-l-none ${error ? "border-red-500" : "border-gray-300"} focus:ring-0 focus:outline-none`}
              ref={ref}
              {...props}
            />
          </div>
        )}
        {!leftText && (
          <textarea
            className={`w-full px-3 py-2 border rounded-md ${error ? "border-red-500" : "border-gray-300"} shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
            ref={ref}
            {...props}
          />
        )}
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
