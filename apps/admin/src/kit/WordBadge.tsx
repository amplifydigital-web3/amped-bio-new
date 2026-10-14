import { cn } from "@repo/ui";

// Admin word badge (087 I15, 088 I11, 089 I07, 094 I12): 26 high, r8, white
// 0.92, an 8 dot and a 13/16 600 label in a utility color. The word carries
// the meaning, so the badge reads without color. Warning uses the solid
// notice pair (#7A4F00 on #FBF1DC).
export type BadgeTone = "nav" | "ink" | "success" | "danger" | "warning" | "neutral";

const TONE: Record<BadgeTone, { box: string; dot: string }> = {
  nav: { box: "bg-white/[0.92] text-prism-nav", dot: "bg-prism-nav" },
  ink: { box: "bg-white/[0.92] text-prism-ink-2", dot: "bg-prism-ink-2" },
  success: { box: "bg-white/[0.92] text-prism-success", dot: "bg-prism-success" },
  danger: { box: "bg-white/[0.92] text-prism-danger", dot: "bg-prism-danger" },
  warning: { box: "bg-prism-warning-bg text-prism-warning-ink", dot: "bg-prism-warning-ink" },
  neutral: { box: "bg-white/[0.92] text-prism-ink-2", dot: "" },
};

export function WordBadge({
  tone,
  children,
  dot = tone !== "neutral",
  solid = false,
  className,
}: {
  tone: BadgeTone;
  children: React.ReactNode;
  dot?: boolean;
  // Solid fill with white text, for the Admin badge on theme cards (088 I04)
  solid?: boolean;
  className?: string;
}) {
  const { box, dot: dotClass } = TONE[tone];
  return (
    <span
      className={cn(
        "inline-flex h-[26px] shrink-0 items-center gap-[5px] whitespace-nowrap rounded-prism-8 px-2 font-prism text-prism-meta font-semibold",
        solid ? "bg-prism-nav text-white" : box,
        !solid && "shadow-[inset_0_0_0_1px_rgba(22,21,43,0.10)]",
        className
      )}
    >
      {dot && !solid && <span aria-hidden className={cn("h-2 w-2 rounded-full", dotClass)} />}
      {children}
    </span>
  );
}
