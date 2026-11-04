import * as React from "react";
import { cn } from "../utils";

/*
 * Prism 2.2 v1.1 additions for Amped Messages (approved by Rob Frasca, 2 Nov 2026;
 * change log claude/amped-prism-2.2-v1.1-changelog.md, board m9). Values reuse the
 * locked tokens only. The switch addition is the existing Prism Switch (108 D1).
 */

/**
 * Count badge. 20 high pill, padding 0 5, 13/16 700 tabular figures, white on nav
 * (6.85:1), capped at 99+. `onIcon` sits it at the top right of a 44 icon with a 2px
 * white ring; `tab` is the quiet version inside a tab (ink on the nav tint).
 * It is decorative: the parent control's label carries the count for screen readers.
 */
export function CountBadge({
  count,
  max = 99,
  variant = "solid",
  onIcon = false,
  className,
}: {
  count: number;
  max?: number;
  variant?: "solid" | "tab";
  onIcon?: boolean;
  className?: string;
}) {
  if (count <= 0) return null;
  const text = count > max ? `${max}+` : String(count);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-[5px] font-prism text-[13px] font-bold leading-4 tabular-nums",
        variant === "solid"
          ? "bg-prism-nav text-white"
          : "bg-prism-nav-tint text-prism-nav-pressed",
        onIcon && "absolute right-[3px] top-[3px] shadow-[0_0_0_2px_#FFFFFF]",
        className
      )}
    >
      {text}
    </span>
  );
}

/**
 * Message bubble. Theirs: white 0.9 with a 1px line, ink 16/24. Yours: nav with white
 * 16/24 (6.85:1). Padding 8 13, r21 with the tail corner r5 on the sender side
 * (`tail` on the last bubble of a run), max width 72% (85% on phones).
 */
export const MessageBubble = React.forwardRef<
  HTMLDivElement,
  {
    mine: boolean;
    tail?: boolean;
    removed?: boolean;
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
  }
>(function MessageBubble(
  { mine, tail = true, removed = false, children, className, onClick },
  ref
) {
  return (
    <div
      ref={ref}
      onClick={onClick}
      className={cn(
        "w-fit max-w-[85%] whitespace-pre-wrap [overflow-wrap:anywhere] rounded-[21px] px-[13px] py-2 font-prism text-[16px] leading-6 sm:max-w-[72%]",
        mine
          ? "bg-prism-nav text-white"
          : "bg-white/90 text-prism-ink shadow-[inset_0_0_0_1px_rgba(22,21,43,0.10)]",
        tail && (mine ? "rounded-br-[5px]" : "rounded-bl-[5px]"),
        removed &&
          (mine
            ? "bg-transparent italic text-prism-ink-2 shadow-[inset_0_0_0_1px_rgba(22,21,43,0.18)]"
            : "italic text-prism-ink-2"),
        className
      )}
    >
      {children}
    </div>
  );
});

/**
 * Typing indicator. Three 8px ink-3 dots in a white 0.9 bubble, padding 13, r21; the
 * dots fade 0.4 to 1 in sequence over 1.2 s, and stand still under reduced motion.
 */
export function TypingIndicator({ label, className }: { label: string; className?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn(
        "inline-flex w-fit items-center gap-[5px] rounded-[21px] rounded-bl-[5px] bg-white/90 p-[13px] shadow-[inset_0_0_0_1px_rgba(22,21,43,0.10)]",
        className
      )}
    >
      {[0, 1, 2].map(i => (
        <span
          key={i}
          aria-hidden
          className="h-2 w-2 rounded-full bg-prism-ink-3 motion-safe:animate-[prism-typing_1.2s_ease-in-out_infinite] motion-reduce:opacity-70"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </div>
  );
}

/** Day label between message runs: 13/16 600 caps 0.08em ink-3, on glass only. */
export function DayLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "py-2 text-center font-prism text-prism-eyebrow uppercase text-prism-ink-3",
        className
      )}
    >
      {children}
    </p>
  );
}
