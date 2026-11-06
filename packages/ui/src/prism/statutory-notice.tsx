import { ALABAMA_HEALTH_WARNINGS, SAMHSA_HELPLINE_NOTICE } from "@repo/constants";
import { cn } from "../utils";

/**
 * Statutory notices for 18+ pages (adult content review 9, AD-D1, PR C1). Alabama
 * Act 2024 HB 164 Section 9(c) asks for 14 point or larger and conspicuous text:
 * 16 px or larger, full contrast ink in the current color inside a 1.5 px outline,
 * never collapsed, truncated or behind a toggle. The text comes only from the
 * constants and is rendered as is.
 *
 * `warnings`: the three Section 9(a)(1) warnings (Over 18 sheet before a pass and
 * the shelf landing). `helpline`: the Section 9(a)(2) notice (every 18+ page).
 */
export function StatutoryNotice({
  kind,
  className,
  style,
}: {
  kind: "warnings" | "helpline";
  className?: string;
  style?: React.CSSProperties;
}) {
  const lines: readonly string[] =
    kind === "warnings" ? ALABAMA_HEALTH_WARNINGS : SAMHSA_HELPLINE_NOTICE;
  return (
    <section
      data-statutory-notice={kind}
      aria-label={kind === "warnings" ? "Health warnings" : "Helpline"}
      className={cn(
        "space-y-[8px] rounded-[13px] border-[1.5px] border-current p-[13px] text-[16px] font-semibold leading-[24px]",
        className
      )}
      style={style}
    >
      {lines.map(line => (
        <p key={line} className="whitespace-normal break-words">
          {line}
        </p>
      ))}
    </section>
  );
}
