import type { ReactNode } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { InfoTip } from "./InfoTip";

/**
 * Card shell for every analytics section. Per the reporting spec each number
 * shows its source, period and update time, so the footer carries all three.
 */
export function AnalyticsCard({
  title,
  description,
  info,
  source,
  period,
  updatedAt,
  action,
  children,
  className = "",
  id,
}: {
  title: string;
  description?: string;
  info?: string;
  source?: string;
  period?: string;
  updatedAt?: Date | number | string | null;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const updated = updatedAt ? new Date(updatedAt) : null;
  return (
    <section
      id={id}
      className={`bg-white border border-gray-200 rounded-xl p-4 md:p-5 flex flex-col scroll-mt-4 ${className}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
            {title}
            {info && <InfoTip text={info} label={title} />}
          </h3>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
        {action}
      </div>
      <div className="flex-1">{children}</div>
      {(source || period || updated) && (
        <p className="mt-3 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
          {[
            source && `Source: ${source}`,
            period,
            updated &&
              `Updated ${formatDistanceToNowStrict(updated, { addSuffix: true })} (${updated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </section>
  );
}
