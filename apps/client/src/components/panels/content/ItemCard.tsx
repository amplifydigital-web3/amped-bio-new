import { MoreHorizontal } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuTrigger, cn } from "@repo/ui";
import { CONTENT_COPY } from "./copy";
import { KindTile, StatusPill } from "./parts";
import { kindBadge, shortDate } from "./lib/labels";
import { itemStatus, type ItemStatusInput } from "./lib/status";

export type LibraryItem = ItemStatusInput & {
  publicId: string;
  kind: string;
  title: string;
  description: string | null;
  durationMs: number | null;
  pageCount: number | null;
  totalBytes: number;
  createdAt: string | Date;
  updatedAt: string | Date;
  /** Recently removed items (PR 6) */
  restorableUntil?: string | Date | null;
};

/**
 * One library item (cs1). The whole title opens the editor. Remove deletes a
 * finished item for 30 days (PR 6) or drops an unfinished or failed upload.
 * A recently removed item offers Restore instead of opening.
 */
export function ItemCard({
  item,
  onOpen,
  onRemove,
  onRestore,
  canRemove,
}: {
  item: LibraryItem;
  onOpen: () => void;
  onRemove: () => void;
  onRestore?: () => void;
  canRemove: boolean;
}) {
  const status = itemStatus(item);
  const removed = status.key === "removed";
  const open = removed ? () => onRestore?.() : onOpen;
  const c = CONTENT_COPY.card;
  // A draft with no description still needs its details (cs1 "Finish details")
  const needsDetails = status.key === "draft" && !item.description;

  return (
    <article className="prism-glass-clear flex min-w-0 flex-col gap-[13px] !rounded-prism-21 p-[13px] font-prism">
      <button
        type="button"
        onClick={open}
        tabIndex={-1}
        aria-hidden
        className="block w-full rounded-prism-13"
      >
        <KindTile kind={item.kind} badge={kindBadge(item)} />
      </button>
      <div className="flex items-start gap-2 px-[8px]">
        <h3 className="min-w-0 flex-1">
          <button
            type="button"
            onClick={removed ? undefined : onOpen}
            disabled={removed}
            className="prism-focus line-clamp-2 rounded-prism-5 text-left text-prism-label font-bold text-prism-ink hover:underline"
          >
            {item.title}
          </button>
          {/* The tile is decorative; its kind label is read here */}
          <span className="sr-only">, {kindBadge(item)}</span>
        </h3>
        <Menu>
          <MenuTrigger
            aria-label={c.actions(item.title)}
            className="prism-icon-btn prism-focus -mr-1 -mt-2 shrink-0"
          >
            <MoreHorizontal className="h-5 w-5 text-prism-ink-2" aria-hidden />
          </MenuTrigger>
          <MenuContent align="end" className="min-w-[189px]">
            {removed ? (
              <MenuItem onSelect={() => onRestore?.()}>{c.restore}</MenuItem>
            ) : (
              <>
                <MenuItem onSelect={onOpen}>{c.edit}</MenuItem>
                {canRemove && <MenuItem onSelect={onRemove}>{c.remove}</MenuItem>}
              </>
            )}
          </MenuContent>
        </Menu>
      </div>
      {status.line && (
        <p
          className={cn(
            "-mt-2 px-[8px] text-prism-meta",
            status.tone === "danger" ? "font-semibold text-prism-danger" : "text-prism-ink-2"
          )}
        >
          {status.line}
        </p>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 px-[8px] pb-[4px]">
        <StatusPill tone={status.tone} label={status.label} />
        {removed ? (
          <button
            type="button"
            onClick={() => onRestore?.()}
            className="prism-focus inline-flex h-touch items-center rounded-prism-8 px-2 text-prism-label font-semibold text-prism-nav hover:underline"
          >
            {c.restore}
          </button>
        ) : needsDetails ? (
          <button
            type="button"
            onClick={onOpen}
            className="prism-focus inline-flex h-touch items-center rounded-prism-8 px-2 text-prism-label font-semibold text-prism-nav hover:underline"
          >
            {c.finish}
          </button>
        ) : (
          <span className="text-prism-meta text-prism-ink-2">{shortDate(item.createdAt)}</span>
        )}
      </div>
    </article>
  );
}
