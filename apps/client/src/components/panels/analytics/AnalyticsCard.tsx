import type { ReactNode } from "react";
import { cn } from "@repo/ui";
import { InfoTip } from "./InfoTip";

/** 093 I15: the eyebrow heading every analytics card uses: 13 600 caps with the nav marker. */
export function Eyebrow({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 id={id} className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2">
      <span aria-hidden className="h-[3px] w-[13px] shrink-0 rounded-full bg-prism-nav" />
      {children}
    </h3>
  );
}

/**
 * Screen Review 093 I15: one card shell for every analytics section. G1 clear
 * r21, padding 21 (13 at 390), eyebrow title with its definition popover, an
 * optional action at the right edge, description below and content 21 under
 * it. The source moves into the popover and the period into the tab's
 * freshness line (I05); cards whose period differs pass their own meta line.
 */
export function AnalyticsCard({
  title,
  description,
  meta,
  info,
  infoLabel,
  source,
  action,
  children,
  className,
  id,
}: {
  title: string;
  description?: ReactNode;
  // 13/16 line under the title for a card whose period differs (Live, Returning visitors)
  meta?: ReactNode;
  info?: string;
  // Popover name when it differs from the title
  infoLabel?: string;
  source?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={cn(
        "prism-glass-clear flex scroll-mt-4 flex-col !rounded-prism-21 p-[13px] font-prism md:p-[21px]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="-my-[13px] flex min-h-touch items-center gap-1">
            <Eyebrow id={id ? `${id}-title` : undefined}>{title}</Eyebrow>
            {info && <InfoTip label={infoLabel ?? title} text={info} source={source} />}
          </div>
          {meta && <p className="mt-[13px] text-prism-meta text-prism-ink-2">{meta}</p>}
          {description && (
            <p className={cn("text-prism-meta text-prism-ink-2", meta ? "mt-1" : "mt-[13px]")}>
              {description}
            </p>
          )}
        </div>
        {action && <div className="-my-[5px] shrink-0">{action}</div>}
      </div>
      <div className="mt-[21px] min-w-0 flex-1">{children}</div>
    </section>
  );
}
