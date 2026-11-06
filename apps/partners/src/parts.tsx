import type { ReactNode } from "react";
import { Input, cn } from "@repo/ui";

export function PageTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-[13px]">
      <h1 className="text-[34px] font-bold leading-[40px] text-prism-ink">{children}</h1>
      {aside}
    </header>
  );
}

export function Panel({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("prism-glass-clear space-y-[13px] !rounded-prism-21 p-[21px]", className)}
    >
      {title && <h2 className="text-[20px] font-bold leading-[24px]">{title}</h2>}
      {children}
    </section>
  );
}

export function Field({
  label,
  value,
  onChange,
  inputMode,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: "numeric" | "decimal" | "text";
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-prism-label font-semibold text-prism-ink">
      {label}
      <Input
        value={value}
        inputMode={inputMode}
        onChange={e => onChange(e.target.value)}
        className="h-touch"
      />
      {hint && <span className="text-prism-meta font-normal text-prism-ink-2">{hint}</span>}
    </label>
  );
}

/** Six digit authenticator code for every money or secret change. */
export function CodeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-prism-label font-semibold text-prism-ink">
      Two factor code
      <Input
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, ""))}
        className="h-touch max-w-[160px]"
      />
    </label>
  );
}

export const th =
  "h-touch whitespace-nowrap px-3 text-left text-prism-eyebrow uppercase text-prism-ink-2 font-semibold";
export const td = "px-3 py-2 align-middle";
export const tr = "border-t border-prism-line";

export function Table({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="prism-slab relative overflow-x-auto">
      <table aria-label={label} className="w-full min-w-[620px] border-collapse">
        {children}
      </table>
    </div>
  );
}

export function Badge({
  tone,
  children,
}: {
  tone: "done" | "warn" | "danger" | "ink";
  children: ReactNode;
}) {
  const cls = {
    done: "text-prism-success",
    warn: "bg-prism-warning-bg text-prism-warning-ink",
    danger: "text-prism-danger",
    ink: "text-prism-ink-2",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex h-[26px] items-center rounded-prism-8 bg-white/90 px-2 text-prism-meta font-semibold",
        cls
      )}
    >
      {children}
    </span>
  );
}
