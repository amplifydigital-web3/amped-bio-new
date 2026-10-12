import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { cn } from "@repo/ui";

// Section 11 title shadow for Bebas titles on the room (Prism 2.2 locked).
export const DISPLAY_TITLE_CLASS =
  "font-prism-display text-prism-display-68 text-prism-ink [text-shadow:0_1px_0_rgba(255,255,255,0.9),5px_13px_34px_rgba(48,47,93,0.14)] sm:text-prism-display";

// Eyebrow with the 13x3 marker (section 10). Navigate marker by default.
export function Eyebrow({
  children,
  marker = "nav",
  className,
}: {
  children: React.ReactNode;
  marker?: "nav" | "value" | "create";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-[3px] w-[13px] shrink-0 rounded-full",
          marker === "nav" && "bg-prism-nav",
          marker === "value" && "bg-prism-value",
          marker === "create" && "bg-prism-create-light"
        )}
      />
      {children}
    </p>
  );
}

// The D20 public shell: the room, the slim public header, the page, then the
// shared footer. Pages pass their own main width and padding.
export function PublicPage({
  children,
  mainClassName,
}: {
  children: React.ReactNode;
  mainClassName?: string;
}) {
  return (
    <div className="prism-room prism-font flex min-h-dvh flex-col text-prism-ink">
      <PublicHeader />
      <main className={cn("w-full flex-1 px-[13px] sm:px-[34px]", mainClassName)}>{children}</main>
      <div className="px-[13px] pt-[55px] sm:px-[34px]">
        <PublicFooter />
      </div>
    </div>
  );
}
