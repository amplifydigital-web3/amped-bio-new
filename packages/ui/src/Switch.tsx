"use client";
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
    <div className={`flex min-h-touch items-center gap-3 ${className}`}>
      <button
        type="button"
        className={`
          ${sizeClasses[size]}
          relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent 
          prism-focus transition-colors duration-prism-control ease-prism
          ${checked ? "bg-prism-nav" : "bg-[rgba(22,21,43,0.28)]"}
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
            transition duration-prism-control ease-prism
            ${translateClasses[size]}
          `}
        />
      </button>
      {label && (
        <span
          className={`font-prism text-prism-label font-medium ${disabled ? "text-prism-ink-3" : "text-prism-ink"}`}
        >
          {label}
        </span>
      )}
    </div>
  );
}
