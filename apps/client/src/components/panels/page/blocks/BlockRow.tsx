import { useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Coins,
  ExternalLink,
  Eye,
  EyeOff,
  Gift,
  GripVertical,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import type { BlockType } from "@repo/constants";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Tooltip,
  cn,
  transitionName,
} from "@repo/ui";
import { getPlatformIcon } from "@/utils/platforms";
import { BlockFields, type ConfigChange } from "./BlockFields";
import { NEED_LABEL, blockMeta, blockNeed, blockTitle, hostOf, isHidden } from "./blockInfo";

// Screen Review 036 and 037. One block as a G0 row: handle, icon, title and
// meta, visibility and overflow always visible. Selecting it opens the row in
// place as the region's one G3 lens with the fields below (D18).

function BlockIcon({ block }: { block: BlockType }) {
  if (block.type === "link" && block.config.platform === "custom" && block.config.url) {
    return (
      <img
        src={`https://www.google.com/s2/favicons?domain=${hostOf(block.config.url)}&sz=64`}
        alt=""
        className="h-[21px] w-[21px] shrink-0 rounded-prism-5"
      />
    );
  }
  const Icon =
    block.type === "pool" || (block.type === "media" && block.config.platform === "creator-pool")
      ? Coins
      : block.type === "referral"
        ? Gift
        : getPlatformIcon(block.type === "text" ? "text" : block.config.platform);
  return <Icon aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-ink-2" />;
}

export function BlockRow({
  block,
  open,
  draft = false,
  index,
  total,
  onToggle,
  onChange,
  onMove,
  onDelete,
  onToggleHidden,
}: {
  block: BlockType;
  open: boolean;
  /** 037 I14: not on the page until its first valid value */
  draft?: boolean;
  index: number;
  total: number;
  onToggle: () => void;
  onChange: ConfigChange;
  onMove: (to: number) => void;
  onDelete: () => void;
  onToggleHidden: () => void;
}) {
  const sortable = useSortable({ id: String(block.id), disabled: draft });
  const headerRef = useRef<HTMLButtonElement>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const hidden = isHidden(block);
  const need = draft ? null : blockNeed(block);
  const title = blockTitle(block);
  const meta = draft ? "Draft, not on your page yet" : blockMeta(block);

  // 036 I13: an opened row scrolls into view, 21 below the top bar
  useEffect(() => {
    if (!open || !rowRef.current) return;
    const top = rowRef.current.getBoundingClientRect().top;
    if (top < 89 || top > window.innerHeight - 144) {
      window.scrollTo({ top: window.scrollY + top - 89, behavior: "smooth" });
    }
  }, [open]);

  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  return (
    <div
      ref={node => {
        sortable.setNodeRef(node);
        rowRef.current = node;
      }}
      style={style}
      // Rows slide into place when one is deleted, restored or moved by a button (#26)
      data-prism-vt-row={transitionName("block", block.id)}
      onKeyDown={event => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          onToggle();
          headerRef.current?.focus();
        }
      }}
      className={cn(
        "relative",
        open ? "prism-lens z-[1] my-2 p-2" : "border-b border-prism-line last:border-b-0",
        sortable.isDragging &&
          "prism-glass-clear z-10 !rounded-prism-13 shadow-[8px_21px_44px_rgba(48,47,93,0.18)]"
      )}
    >
      {open && (
        <>
          <span aria-hidden className="prism-halo-card" />
          <span aria-hidden className="prism-rim" />
        </>
      )}

      <div className="relative flex min-h-commit items-center gap-1 pr-2">
        <Tooltip content="Drag to reorder">
          <button
            type="button"
            {...sortable.attributes}
            {...sortable.listeners}
            aria-label={`Reorder ${title}`}
            aria-describedby="reorder-help"
            disabled={draft}
            className="prism-focus flex h-touch w-touch shrink-0 cursor-grab touch-none items-center justify-center rounded-prism-13 active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
          >
            <GripVertical aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
          </button>
        </Tooltip>

        <button
          ref={headerRef}
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="prism-focus flex min-h-touch min-w-0 flex-1 items-center gap-3 rounded-prism-13 px-1 text-left"
        >
          <BlockIcon block={block} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-prism-label font-semibold text-prism-ink">
              {title}
            </span>
            <span className="flex min-w-0 items-center gap-1 text-prism-meta text-prism-ink-2">
              {need && (
                <AlertTriangle
                  aria-hidden
                  className="h-[21px] w-[21px] shrink-0 text-prism-warning-ink"
                />
              )}
              {hidden && !need && <EyeOff aria-hidden className="h-[13px] w-[13px] shrink-0" />}
              <span className="truncate">
                {need ? NEED_LABEL[need] : hidden ? `Hidden${meta ? `, ${meta}` : ""}` : meta}
              </span>
            </span>
          </span>
        </button>

        {!draft && (
          <button
            type="button"
            aria-pressed={hidden}
            aria-label={hidden ? "Show on page" : "Hide from page"}
            title={hidden ? "Show on page" : "Hide from page"}
            onClick={onToggleHidden}
            className="prism-focus flex h-touch w-touch shrink-0 items-center justify-center rounded-prism-13 hover:bg-white/60"
          >
            {hidden ? (
              <EyeOff aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
            ) : (
              <Eye aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
            )}
          </button>
        )}

        {!draft && (
          <Menu>
            <MenuTrigger
              aria-label={`More options for ${title}`}
              className="prism-focus flex h-touch w-touch shrink-0 items-center justify-center rounded-prism-13 hover:bg-white/60"
            >
              <MoreHorizontal aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
            </MenuTrigger>
            <MenuContent align="end">
              {block.type === "link" && block.config.url && (
                <MenuItem asChild>
                  <a href={block.config.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink aria-hidden />
                    Open link
                  </a>
                </MenuItem>
              )}
              <MenuItem disabled={index === 0} onSelect={() => onMove(index - 1)}>
                <ArrowUp aria-hidden />
                Move up
              </MenuItem>
              <MenuItem disabled={index === total - 1} onSelect={() => onMove(index + 1)}>
                <ArrowDown aria-hidden />
                Move down
              </MenuItem>
              <MenuSeparator />
              <MenuItem destructive onSelect={onDelete}>
                <Trash2 aria-hidden />
                Delete
              </MenuItem>
            </MenuContent>
          </Menu>
        )}

        {open && (
          <button
            type="button"
            aria-label="Collapse"
            aria-expanded
            onClick={onToggle}
            className="prism-focus flex h-touch w-touch shrink-0 items-center justify-center rounded-prism-13"
          >
            <ChevronDown aria-hidden className="h-[21px] w-[21px] rotate-180 text-prism-ink-2" />
          </button>
        )}
      </div>

      {open && (
        <div className="prism-slab relative mt-2 p-[21px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-prism-control">
          <BlockFields block={block} onValid={onChange} />
        </div>
      )}
    </div>
  );
}
