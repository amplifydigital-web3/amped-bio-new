import { ChevronRight, Link2 } from "lucide-react";
import type { AnalyticsLink } from "./format";
import { SERIES_COLORS, formatNumber, formatPercent } from "./format";

export function TopLinksTable({
  links,
  onSelect,
}: {
  links: AnalyticsLink[];
  onSelect: (link: AnalyticsLink) => void;
}) {
  if (links.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-6 text-center">
        Add link blocks to your page to see click performance here.
      </div>
    );
  }

  const maxClicks = Math.max(1, ...links.map(link => link.clicks));

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500">
            <th className="text-left font-medium px-1 py-2">Link</th>
            <th className="text-right font-medium px-1 py-2">Clicks</th>
            <th className="text-right font-medium px-1 py-2 hidden sm:table-cell">Unique</th>
            <th className="text-right font-medium px-1 py-2">Clicks per view</th>
            <th className="w-6" />
          </tr>
        </thead>
        <tbody>
          {links.map(link => (
            <tr
              key={link.blockId}
              className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
              onClick={() => onSelect(link)}
            >
              <td className="px-1 py-2.5 max-w-0 w-full">
                <div className="flex items-center gap-2 min-w-0">
                  <Link2 className="w-4 h-4 text-gray-400 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900 truncate">{link.label}</div>
                    <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(link.clicks / maxClicks) * 100}%`,
                          backgroundColor: SERIES_COLORS.clicks,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-1 py-2.5 text-right tabular-nums font-medium text-gray-900">
                {formatNumber(link.clicks)}
              </td>
              <td className="px-1 py-2.5 text-right tabular-nums text-gray-600 hidden sm:table-cell">
                {formatNumber(link.uniqueClicks)}
              </td>
              <td className="px-1 py-2.5 text-right tabular-nums text-gray-600">
                {formatPercent(link.ctr)}
              </td>
              <td className="px-1 py-2.5 text-gray-400">
                <ChevronRight className="w-4 h-4" aria-label="View link details" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
