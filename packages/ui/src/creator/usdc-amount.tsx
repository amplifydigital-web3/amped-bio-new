import { usdcDollars } from "@repo/constants";
import { cn } from "../utils";

/**
 * Decision D6 (docs/features/mobile-checkout.md 5): "$3 USDC" on creator money surfaces.
 * The figure renders large and USDC as a small tag beside it. Never "$3" alone. The
 * figure uses the Prism font with tabular numbers so it reads in any creator theme.
 */
export function UsdcAmount({
  units,
  size = "md",
  className,
}: {
  /** USDC units, 6 decimals */
  units: string | bigint;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 font-prism tabular-nums", className)}>
      <span
        className={cn(
          "font-bold",
          size === "lg" ? "text-[34px] leading-[40px]" : "text-[16px] leading-6"
        )}
      >
        {usdcDollars(units)}
      </span>
      <span
        className={cn(
          "rounded-full border border-current px-1.5 font-semibold opacity-80",
          size === "lg" ? "text-[13px] leading-[18px]" : "text-[11px] leading-4"
        )}
      >
        USDC
      </span>
    </span>
  );
}
