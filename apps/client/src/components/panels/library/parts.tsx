/**
 * Fan Library building blocks (Build Board #26, FL-3; boards m1, m3, fl-q1).
 * Mixed screens show each creator as an avatar ring, a 4 px accent and, on
 * creator actions, the creator's button color (spec 3.2). Names in Figtree.
 */
import type { ReactNode } from "react";
import { FileText, Headphones, Image as ImageIcon, Paperclip, Play, Video } from "lucide-react";
import {
  contentCardMeta,
  type LibraryItem,
  type LibraryOwner,
  type ContentCard,
} from "@repo/constants";
import {
  Skeleton,
  cn,
  requirePlayerSource,
  trpcClient,
  type PlayerItem,
  type QueueEntry,
  type SourceResolver,
} from "@repo/ui";
import { LIBRARY_COPY } from "./copy";
import { LIBRARY_PATHS } from "./paths";
import { activeAccount, localSource } from "./downloads/store";

const C = LIBRARY_COPY;

/** The Prism nav color, for creators with no button color. */
export const DEFAULT_ACCENT = "#5650A2";

export function ownerName(owner: Pick<LibraryOwner, "name" | "handle">) {
  return owner.name?.trim() || `@${owner.handle}`;
}

/** The one label an item shows (spec 2.1). Followers and Public show none. */
export function accessLabel(item: Pick<LibraryItem, "accessSource" | "planName">) {
  if (item.accessSource === "member") return item.planName || C.labels.member;
  return C.labels[item.accessSource];
}

export function isPlayable(item: Pick<ContentCard, "kind">) {
  return item.kind === "video" || item.kind === "audio";
}

/** Fresh signed URLs for an item, every time the player asks, or its offline copy. */
export function resolverFor(publicId: string): SourceResolver {
  return async () => {
    // FL-5: a copy on this device plays from the device, online or not
    const local = localSource(activeAccount(), publicId);
    if (local) return local;
    const result = await trpcClient.content.getReadUrl.query({ publicId });
    return requirePlayerSource(result.playback);
  };
}

/** What the shared player needs to play a Library item. Null for files, photos and documents. */
export function playerItemFor(item: LibraryItem): PlayerItem | null {
  if (!isPlayable(item)) return null;
  return {
    id: item.publicId,
    kind: item.kind === "audio" ? "audio" : "video",
    title: item.title,
    subtitle: ownerName(item.owner),
    artwork: item.cover?.src ?? null,
    durationMs: item.durationMs,
    href: LIBRARY_PATHS.item(item.owner.handle, item.publicId),
    ownerId: item.owner.handle,
    label: accessLabel(item),
  };
}

/** Every listed item is one the fan can open (spec 3.4), so canOpen is true. */
export function queueEntryFor(item: LibraryItem): QueueEntry | null {
  const playerItem = playerItemFor(item);
  return playerItem
    ? { item: playerItem, resolve: resolverFor(item.publicId), canOpen: true }
    : null;
}

/** Minutes left in a started item, or null when the item has no clock. */
export function minutesLeft(item: Pick<LibraryItem, "progress" | "durationMs">) {
  const duration = item.progress?.durationMs ?? item.durationMs;
  if (!item.progress || !duration) return null;
  return Math.max(1, Math.ceil((duration - item.progress.positionMs) / 60_000));
}

export function progressFraction(item: Pick<LibraryItem, "progress" | "durationMs">) {
  const duration = item.progress?.durationMs ?? item.durationMs;
  if (!item.progress || !duration) return 0;
  return Math.min(1, Math.max(0, item.progress.positionMs / duration));
}

const KIND_ICON = {
  video: Video,
  audio: Headphones,
  image: ImageIcon,
  document: FileText,
  file: Paperclip,
} as const;

/** The creator's avatar inside a 2 px ring in their accent. */
export function CreatorAvatar({
  owner,
  size = 44,
  className,
}: {
  owner: LibraryOwner;
  size?: number;
  className?: string;
}) {
  const name = ownerName(owner);
  const initials = name
    .replace(/^@/, "")
    .split(/\s+/)
    .map(part => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 rounded-full p-[2px]", className)}
      style={{ background: owner.accent || DEFAULT_ACCENT }}
    >
      <span className="inline-flex rounded-full bg-white p-[2px]">
        {owner.image ? (
          <img
            src={owner.image}
            alt=""
            width={size - 8}
            height={size - 8}
            className="rounded-full object-cover"
            style={{ width: size - 8, height: size - 8 }}
          />
        ) : (
          <span
            className="inline-flex items-center justify-center rounded-full bg-prism-nav-tint font-prism text-[13px] font-semibold text-prism-ink"
            style={{ width: size - 8, height: size - 8 }}
          >
            {initials}
          </span>
        )}
      </span>
    </span>
  );
}

/** "Maya Lin" with the creator's 4 px brand mark before it. */
export function OwnerLine({ owner, className }: { owner: LibraryOwner; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <span
        aria-hidden
        className="h-[13px] w-1 shrink-0 rounded-full"
        style={{ background: owner.accent || DEFAULT_ACCENT }}
      />
      <span className="truncate">{ownerName(owner)}</span>
    </span>
  );
}

export function AccessLabel({ item }: { item: Pick<LibraryItem, "accessSource" | "planName"> }) {
  const label = accessLabel(item);
  if (!label) return null;
  return (
    <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-prism-nav-tint px-2 text-[13px] font-semibold text-prism-ink">
      {label}
    </span>
  );
}

/** The cover, its blur while it loads, or the kind icon when there is none. */
export function ItemCover({
  item,
  className,
  sizes,
}: {
  item: Pick<ContentCard, "cover" | "blur" | "kind">;
  className?: string;
  sizes?: string;
}) {
  const Icon = KIND_ICON[item.kind];
  return (
    <span
      aria-hidden
      className={cn("relative block overflow-hidden bg-prism-nav-tint", className)}
      style={
        item.blur ? { backgroundImage: `url("${item.blur}")`, backgroundSize: "cover" } : undefined
      }
    >
      {item.cover ? (
        <img
          src={item.cover.src}
          srcSet={item.cover.srcSet || undefined}
          sizes={sizes}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <Icon className="absolute inset-0 m-auto h-6 w-6 text-prism-ink-2" strokeWidth={1.5} />
      )}
    </span>
  );
}

export function SectionHeading({
  id,
  children,
  action,
}: {
  id: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-touch items-center justify-between gap-3">
      <h2 id={id} className="text-[20px] font-semibold leading-tight text-prism-ink">
        {children}
      </h2>
      {action}
    </div>
  );
}

/**
 * One item in a list (Newest, Saved, search): cover, a 2 line title, the owner
 * with the brand mark, the kind line and the one label. The row opens the item;
 * the menu sits beside it so the two targets never nest.
 */
export function ItemRow({
  item,
  onOpen,
  menu,
}: {
  item: LibraryItem;
  onOpen: () => void;
  menu?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1 rounded-prism-13 transition-colors duration-prism-hover ease-prism hover:bg-white/60">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${C.open(item.title)}, ${C.by(ownerName(item.owner))}`}
        className="prism-focus flex min-h-[88px] min-w-0 flex-1 items-center gap-3 rounded-prism-13 px-2 py-2 text-left"
      >
        <ItemCover item={item} sizes="128px" className="aspect-video w-[112px] rounded-prism-13" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="line-clamp-2 text-[16px] font-semibold leading-snug text-prism-ink">
            {item.title}
          </span>
          <OwnerLine owner={item.owner} className="text-[14px] text-prism-ink-2" />
          <span className="flex min-w-0 items-center gap-2 text-[13px] text-prism-ink-2">
            <span className="truncate">{contentCardMeta(item)}</span>
            <AccessLabel item={item} />
          </span>
        </span>
      </button>
      {menu}
    </div>
  );
}

/** The playing icon for a 44 px play target. */
export function PlayGlyph() {
  return <Play aria-hidden className="ml-0.5 h-5 w-5 fill-current" />;
}

export function ItemListSkeleton({ rows = 4, label }: { rows?: number; label: string }) {
  return (
    <div aria-busy aria-label={label} className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-[88px] items-center gap-3 px-2">
          <Skeleton className="aspect-video w-[112px] rounded-prism-13" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4 rounded-full" />
            <Skeleton className="h-3 w-1/2 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
