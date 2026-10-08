import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  cn,
} from "@repo/ui";

// Admin G2 slab table (D20, 087 I15, 088 I11, 089 I06 and I09, 094 I02).
// Header 44 with 13 600 caps labels; rows 55 (two line cells) or 44; the
// slab scrolls sideways inside itself with the first column sticky, so the
// page never scrolls sideways at 390.

export function SlabTable({
  children,
  label,
  className,
  footer,
}: {
  children: React.ReactNode;
  // Accessible name of the table
  label: string;
  className?: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className={cn("prism-slab overflow-hidden font-prism", className)}>
      <div className="overflow-x-auto">
        <table aria-label={label} className="w-full border-collapse text-left">
          {children}
        </table>
      </div>
      {footer}
    </div>
  );
}

export const thClass =
  "h-touch whitespace-nowrap px-3 text-prism-eyebrow uppercase text-prism-ink-2 font-semibold";
export const tdClass = "px-3 align-middle";
export const rowClass = "h-14 border-t border-prism-line";
// First column stays in place while the slab scrolls sideways on phones
export const stickyCell =
  "sticky left-0 z-[1] bg-white/[0.94] backdrop-blur md:static md:bg-transparent md:backdrop-blur-0";

export function SlabHead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr>{children}</tr>
    </thead>
  );
}

export type SortDirection = "asc" | "desc";

/** A sortable header is a button with aria-sort on its cell and a 13 chevron. */
export function SortHeader({
  label,
  column,
  sort,
  onSort,
  align = "left",
  className,
}: {
  label: string;
  column: string;
  sort: { column: string; direction: SortDirection };
  onSort: (column: string) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.column === column;
  const ariaSort = active ? (sort.direction === "asc" ? "ascending" : "descending") : "none";
  const Icon = active && sort.direction === "asc" ? ChevronUp : ChevronDown;
  return (
    <th scope="col" aria-sort={ariaSort} className={cn(thClass, "px-2", className)}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "prism-focus inline-flex h-touch items-center gap-1 rounded-prism-8 px-2 uppercase",
          align === "right" && "ml-auto flex",
          active ? "text-prism-ink" : "text-prism-ink-2"
        )}
      >
        {label}
        <Icon
          aria-hidden
          className={cn("h-[13px] w-[13px]", active ? "opacity-100" : "opacity-40")}
        />
      </button>
    </th>
  );
}

/** Row skeletons at the final row height, shown after 400ms (row 082). */
export function SlabSkeletonRows({
  rows = 5,
  columns,
  height = "h-14",
}: {
  rows?: number;
  columns: number;
  height?: string;
}) {
  return (
    <tbody aria-hidden>
      {Array.from({ length: rows }).map((_, row) => (
        <tr key={row} className={cn(height, "border-t border-prism-line")}>
          {Array.from({ length: columns }).map((__, column) => (
            <td key={column} className={tdClass}>
              <Skeleton delayMs={400} className={cn("h-3", column === 0 ? "w-32" : "w-16")} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

/** One row that spans the table, for empty, no results and error states. */
export function SlabMessageRow({
  columns,
  children,
}: {
  columns: number;
  children: React.ReactNode;
}) {
  return (
    <tbody>
      <tr className="border-t border-prism-line">
        <td colSpan={columns} className="p-0">
          {children}
        </td>
      </tr>
    </tbody>
  );
}

const PAGE_SIZES = [10, 20, 50, 100];

/**
 * Slab footer pager (087 I17): 55 high. Left: "1 to 20 of 1,284". Right: an
 * optional Rows per page select, Previous and Next 44 icon buttons and up to
 * five 44 page chips with the current one selected.
 */
export function SlabPager({
  page,
  pages,
  total,
  pageSize,
  onPage,
  onPageSize,
  noun,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
  // Used in the button names, for example "users"
  noun?: string;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  let start = Math.max(1, page - 2);
  const end = Math.min(pages, start + 4);
  start = Math.max(1, end - 4);
  const chips = Array.from({ length: end - start + 1 }, (_, index) => start + index);

  return (
    <nav
      aria-label={noun ? `${noun} pages` : "Pages"}
      className="flex min-h-commit flex-wrap items-center justify-between gap-3 border-t border-prism-line px-4 py-2"
    >
      <p className="text-prism-meta tabular-nums text-prism-ink-2">
        {from.toLocaleString("en-US")} to {to.toLocaleString("en-US")} of{" "}
        {total.toLocaleString("en-US")}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSize && (
          <label className="flex items-center gap-2 text-prism-meta text-prism-ink-2">
            <span>Rows per page</span>
            <Select value={String(pageSize)} onValueChange={value => onPageSize(Number(value))}>
              <SelectTrigger className="h-touch w-[89px]" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map(size => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="prism-icon-btn prism-focus prism-btn-disabled"
        >
          <ChevronLeft aria-hidden className="h-5 w-5" />
        </button>
        {chips.map(chip => (
          <button
            key={chip}
            type="button"
            aria-label={`Page ${chip}`}
            aria-current={chip === page ? "page" : undefined}
            onClick={() => onPage(chip)}
            className={cn(
              "prism-focus inline-flex h-touch w-touch items-center justify-center rounded-full text-prism-label font-semibold tabular-nums",
              chip === page ? "prism-lens-thumb text-prism-nav-pressed" : "prism-chip"
            )}
          >
            {chip}
          </button>
        ))}
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className="prism-icon-btn prism-focus prism-btn-disabled"
        >
          <ChevronRight aria-hidden className="h-5 w-5" />
        </button>
      </div>
    </nav>
  );
}
