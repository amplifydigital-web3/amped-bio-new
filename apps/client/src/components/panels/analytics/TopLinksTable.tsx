import { useState } from "react";
import { Link2, Plus } from "lucide-react";
import { Button, EmptyState } from "@repo/ui";
import type { AnalyticsLink } from "./format";
import { DATA_PALETTE, formatNumber, formatPercent } from "./format";

const ROWS_AT_REST = 5;

/**
 * Screen Review 093 I20 to I22: G0 rows 55 ranked by clicks. The whole row is
 * a button (Enter and Space open the detail; focus returns on close). Clicks,
 * Unique (hidden at 390) and Click rate are tabular. Five rows at rest.
 */
export function TopLinksTable({
  links,
  onSelect,
  onAddLink,
}: {
  links: AnalyticsLink[];
  onSelect: (link: AnalyticsLink, trigger: HTMLButtonElement) => void;
  onAddLink: () => void;
}) {
  const [showAll, setShowAll] = useState(false);

  if (links.length === 0) {
    return (
      <EmptyState
        icon={Link2}
        title="No links yet"
        description="Add link blocks to your page to see click performance here."
        action={
          <Button variant="secondary" onClick={onAddLink}>
            <Plus aria-hidden />
            Add a link
          </Button>
        }
      />
    );
  }

  const maxClicks = Math.max(1, ...links.map(link => link.clicks));
  const shown = showAll ? links : links.slice(0, ROWS_AT_REST);
  const columns =
    "grid grid-cols-[21px_minmax(0,1fr)_64px_72px] items-center gap-x-[13px] md:grid-cols-[21px_minmax(0,1fr)_64px_64px_72px]";

  return (
    <div className="font-prism">
      <div className={`${columns} pb-2 text-prism-meta text-prism-ink-2`} aria-hidden>
        <span>#</span>
        <span>Link</span>
        <span className="text-right">Clicks</span>
        <span className="hidden text-right md:block">Unique</span>
        <span className="text-right">Click rate</span>
      </div>
      <ul className="divide-y divide-prism-line border-t border-prism-line">
        {shown.map((link, index) => (
          <li key={link.blockId}>
            <button
              type="button"
              aria-label={`Open details for ${link.label}`}
              onClick={event => onSelect(link, event.currentTarget)}
              className={`${columns} prism-focus min-h-commit w-full rounded-prism-8 py-2 text-left hover:bg-white/40`}
            >
              <span className="text-prism-meta tabular-nums text-prism-ink-2">{index + 1}</span>
              <span className="min-w-0">
                <span className="block truncate text-prism-label font-semibold text-prism-ink">
                  {link.label}
                </span>
                <span
                  aria-hidden
                  className="mt-1 block h-[5px] overflow-hidden rounded-prism-8"
                  style={{ backgroundColor: DATA_PALETTE.bar }}
                >
                  <span
                    className="block h-full rounded-prism-8"
                    style={{
                      width: `${(link.clicks / maxClicks) * 100}%`,
                      backgroundColor: DATA_PALETTE.series1,
                    }}
                  />
                </span>
              </span>
              <span className="text-right text-prism-label font-semibold tabular-nums text-prism-ink">
                {formatNumber(link.clicks)}
              </span>
              <span className="hidden text-right text-prism-label tabular-nums text-prism-ink-2 md:block">
                {formatNumber(link.uniqueClicks)}
              </span>
              <span className="text-right text-prism-label tabular-nums text-prism-ink-2">
                {formatPercent(link.ctr)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {links.length > ROWS_AT_REST && (
        <Button
          variant="ghost"
          className="mt-2"
          aria-expanded={showAll}
          onClick={() => setShowAll(open => !open)}
        >
          {showAll ? "Show fewer links" : `Show all ${links.length} links`}
        </Button>
      )}
    </div>
  );
}
