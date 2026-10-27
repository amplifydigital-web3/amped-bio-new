import { Circle, CircleCheck } from "lucide-react";
import { cn } from "@repo/ui";

// Password rules shared by register (008) and reset password (013)
export const PASSWORD_RULES = [
  { label: "8 or more characters", test: (value: string) => value.length >= 8 },
  { label: "An uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { label: "A lowercase letter", test: (value: string) => /[a-z]/.test(value) },
  { label: "A number", test: (value: string) => /[0-9]/.test(value) },
];

export const passwordMeetsRules = (value: string) => PASSWORD_RULES.every(rule => rule.test(value));

// Live checklist under the password well, visible on focus or when invalid,
// kept for screen readers otherwise.
export function PasswordChecklist({
  id,
  password,
  visible,
}: {
  id: string;
  password: string;
  visible: boolean;
}) {
  return (
    <ul
      id={id}
      aria-live="polite"
      className={cn("space-y-[5px] font-prism text-prism-meta", !visible && "sr-only")}
    >
      {PASSWORD_RULES.map(rule => {
        const met = rule.test(password);
        return (
          <li
            key={rule.label}
            className={cn(
              "flex items-center gap-1.5",
              met ? "text-prism-success" : "text-prism-ink-2"
            )}
          >
            {met ? (
              <CircleCheck className="h-[13px] w-[13px] shrink-0" aria-hidden />
            ) : (
              <Circle className="h-[13px] w-[13px] shrink-0" aria-hidden />
            )}
            {rule.label}
            {met && <span className="sr-only">, met</span>}
          </li>
        );
      })}
    </ul>
  );
}
