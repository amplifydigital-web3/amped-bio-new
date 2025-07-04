import React from "react";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}

export function Switch({
  checked,
  onChange,
  disabled = false,
  size = "md",
  label,
  className = "",
}: SwitchProps) {
  const sizeClasses = {
    sm: "w-9 h-5",
    md: "w-11 h-6",
    lg: "w-14 h-7",
  };

  const thumbSizeClasses = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  };

  const translateClasses = {
    sm: checked ? "translate-x-4" : "translate-x-0",
    md: checked ? "translate-x-5" : "translate-x-0",
    lg: checked ? "translate-x-7" : "translate-x-0",
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <button
        type="button"
        className={`
          ${sizeClasses[size]}
          relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent 
          transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          ${checked ? "bg-blue-600" : "bg-gray-200"}
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        `}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
      >
        <span
          aria-hidden="true"
          className={`
            ${thumbSizeClasses[size]}
            pointer-events-none inline-block rounded-full bg-white shadow transform ring-0 
            transition duration-200 ease-in-out
            ${translateClasses[size]}
          `}
        />
      </button>
      {label && (
        <span className={`text-sm font-medium ${disabled ? "text-gray-400" : "text-gray-900"}`}>
          {label}
        </span>
      )}
    </div>
  );
}
