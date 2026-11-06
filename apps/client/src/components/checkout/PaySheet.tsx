import type { ReactNode } from "react";
import { AlertCircle, BadgeCheck, Check, Loader2, X } from "lucide-react";
import { CHECKOUT_COPY, usdcDollars, type AnyThemeConfig } from "@repo/constants";
import { CreatorThemeScope, UsdcAmount, cn, moneySheetColors } from "@repo/ui";

/**
 * The creator branded pay sheet (docs/features/mobile-checkout.md 5, boards c1, c5, c7,
 * c8). Full screen on phones with the creator page dimmed behind it; a 420 wide sheet
 * on desktop. The creator's look comes from CreatorThemeScope; figures and legal lines
 * use the Prism font with tabular numbers on a solid surface.
 */

export type SheetCreator = {
  handle: string;
  name: string;
  image: string | null;
  theme: AnyThemeConfig | null;
};

export function SheetFrame({
  creator,
  verified = false,
  closeHref,
  notes,
  children,
  footer,
  payingLabel,
}: {
  creator: SheetCreator | null;
  /** The creator passes the seller rule (identity checks 5.1): the Verified chip (CK-5) */
  verified?: boolean;
  closeHref: string;
  /** Staging and mock lines, above the footer */
  notes?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** AB-2 service sheet: "Paying" over the merchant name instead of Paying @handle */
  payingLabel?: string;
}) {
  const colors = moneySheetColors(creator?.theme);
  return (
    <div className="fixed inset-0 overflow-y-auto" style={colors.backdrop}>
      {/* The creator page, dimmed: the sheet reads as the same place */}
      <div aria-hidden className="fixed inset-0 bg-[rgba(22,21,43,0.55)]" />
      <CreatorThemeScope
        theme={creator?.theme}
        className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col md:my-[55px] md:min-h-0"
      >
        <main
          aria-labelledby="pay-sheet-title"
          className="flex min-h-dvh flex-col md:min-h-0 md:rounded-prism-21 md:shadow-[0_21px_55px_rgba(22,21,43,0.35)]"
          style={{ background: colors.surface, color: colors.text }}
        >
          <header className="flex items-center gap-3 px-[21px] pb-[13px] pt-[max(21px,env(safe-area-inset-top))]">
            {creator?.image ? (
              <img
                src={creator.image}
                alt=""
                className="h-[44px] w-[44px] shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full text-[18px] font-bold"
                style={{ background: colors.button.border, color: colors.button.color }}
              >
                {(creator?.name || "?").charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 items-center gap-[6px] text-[16px] font-semibold leading-6">
                <span className="truncate">{creator?.name}</span>
                {verified && creator && (
                  <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-current px-2 text-[13px] font-semibold leading-none">
                    <BadgeCheck aria-hidden className="h-[14px] w-[14px]" />
                    {CHECKOUT_COPY.verified}
                  </span>
                )}
              </p>
              {creator && (
                <p id="pay-sheet-title" className="truncate text-[14px] leading-5 opacity-80">
                  {payingLabel ?? CHECKOUT_COPY.paying(creator.handle)}
                </p>
              )}
            </div>
            <a
              href={closeHref}
              aria-label="Close"
              className="inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-full outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amped-font)]"
            >
              <X aria-hidden className="h-[21px] w-[21px]" />
            </a>
          </header>
          <div className="flex flex-1 flex-col gap-[21px] px-[21px] pb-[21px]">{children}</div>
          {(notes || footer) && (
            <div
              className="sticky bottom-0 flex flex-col gap-[13px] px-[21px] md:rounded-b-prism-21 pb-[max(21px,env(safe-area-inset-bottom))] pt-[13px] font-prism"
              style={{ background: colors.surface }}
            >
              {notes}
              {footer}
            </div>
          )}
        </main>
      </CreatorThemeScope>
    </div>
  );
}

/** The commit button in the creator's color, or the guarded neutral when it cannot read. */
export function SheetButton({
  theme,
  children,
  onClick,
  href,
  busy,
  disabled,
  variant = "primary",
}: {
  theme: AnyThemeConfig | null | undefined;
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  busy?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  const { button, text } = moneySheetColors(theme);
  const style =
    variant === "primary"
      ? { background: button.background, color: button.color, borderColor: button.border }
      : { background: "transparent", color: text, borderColor: "currentColor" };
  const className = cn(
    "inline-flex min-h-[55px] w-full items-center justify-center gap-2 rounded-prism-13 border-2 px-4 font-prism text-[17px] font-semibold tabular-nums outline-none transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amped-font)] active:translate-y-px motion-reduce:active:translate-y-0",
    (disabled || busy) && "cursor-not-allowed opacity-60"
  );
  if (href) {
    return (
      <a href={href} className={className} style={style}>
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy && <Loader2 aria-hidden className="h-5 w-5 animate-spin motion-reduce:animate-none" />}
      {children}
    </button>
  );
}

/** One label and value row; the value is a USDC amount or text. */
export function FigureRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-h-touch items-center justify-between gap-3 border-b border-[color:color-mix(in_srgb,currentColor_15%,transparent)] py-2 last:border-b-0">
      <span className="text-[15px] leading-5 opacity-80">{label}</span>
      <span className="text-right text-[15px] font-semibold leading-5 tabular-nums">{value}</span>
    </div>
  );
}

export function Figures({ children }: { children: ReactNode }) {
  return <div className="flex flex-col font-prism tabular-nums">{children}</div>;
}

/** The error pattern (spec 10): what happened, whether anything was taken, one next step. */
export function SheetMessage({
  tone,
  title,
  children,
}: {
  tone: "error" | "done" | "busy";
  title: string;
  children?: ReactNode;
}) {
  const Icon = tone === "done" ? Check : tone === "busy" ? Loader2 : AlertCircle;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className="flex flex-col items-center gap-[13px] py-[34px] text-center"
    >
      <span className="flex h-[55px] w-[55px] items-center justify-center rounded-full border-2 border-current">
        <Icon
          aria-hidden
          className={cn(
            "h-[26px] w-[26px]",
            tone === "busy" && "animate-spin motion-reduce:animate-none"
          )}
        />
      </span>
      <p className="max-w-[320px] text-[17px] font-semibold leading-6">{title}</p>
      {children}
    </div>
  );
}

/** "$3 USDC" in a row, as text for screen readers and the tag for the eye. */
export function Amount({ units }: { units: string | bigint }) {
  return (
    <>
      <span className="sr-only">{usdcDollars(units)} USDC</span>
      <span aria-hidden>
        <UsdcAmount units={units} />
      </span>
    </>
  );
}
