/**
 * An item opened from the Library (Build Board #26, FL-3) at
 * /library/@handle/c/{publicId}. Video and audio play in the shared player with
 * the FL-1 phone controls, Save, chapters and Up next from the same creator
 * (decision D). Photos open in the photo viewer. Documents and files open on
 * the creator's public item page, which has the PDF viewer (FL-1).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import { ExternalLink, FileX } from "lucide-react";
import { contentCardMeta, type LibraryItem } from "@repo/constants";
import {
  Button,
  ChapterList,
  EmptyState,
  MediaPlayer,
  PhotoViewer,
  PlayerActions,
  Skeleton,
  UpNextList,
  trpc,
  trpcClient,
  useOptionalPlayer,
  type PlayerItem,
} from "@repo/ui";
import { LIBRARY_COPY } from "./copy";
import { LIBRARY_PATHS } from "./paths";
import { useLibraryActions } from "./ItemMenu";
import { OwnerLine, queueEntryFor, resolverFor } from "./parts";

const C = LIBRARY_COPY;

/** The creator's public item page, for documents and files. */
export function publicItemUrl(handle: string, publicId: string) {
  return `${import.meta.env.VITE_LANDINGPAGE_URL}/${handle}/c/${publicId}`;
}

export function ItemView({ handle, publicId }: { handle: string; publicId: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const player = useOptionalPlayer();
  const actions = useLibraryActions();
  // A list hands over whether the item is saved; the toggle keeps it current
  const [saved, setSaved] = useState<boolean>(() => !!location.state?.savedAt);

  const item = useQuery({
    ...trpc.content.getPublic.queryOptions({ handle, publicId }),
    retry: false,
  });
  const yours = useQuery({
    ...trpc.library.creatorItems.queryOptions({ handle, seg: "yours" }),
    staleTime: 60_000,
  });
  const photo = useQuery({
    queryKey: ["library", "photo", publicId],
    queryFn: () => trpcClient.content.getReadUrl.query({ publicId }),
    enabled: item.data?.kind === "image",
    staleTime: 60_000,
  });

  const data = item.data;
  const owner = useMemo(
    () => ({
      handle: data?.creator.handle ?? handle,
      name: data?.creator.name ?? null,
      image: data?.creator.image ?? null,
      accent: yours.data?.items[0]?.owner.accent ?? null,
    }),
    [data, handle, yours.data]
  );
  const creatorName = owner.name || `@${owner.handle}`;

  const playerItem = useMemo<PlayerItem | null>(() => {
    if (!data || (data.kind !== "video" && data.kind !== "audio")) return null;
    return {
      id: data.publicId,
      kind: data.kind,
      title: data.title,
      subtitle: creatorName,
      artwork: data.cover?.src ?? null,
      durationMs: data.durationMs,
      chapters: data.chapters,
      href: LIBRARY_PATHS.item(owner.handle, data.publicId),
      ownerId: owner.handle,
    };
  }, [data, creatorName, owner.handle]);
  const resolve = useMemo(() => resolverFor(publicId), [publicId]);

  // Up next: the creator's other items, newest first. Autoplay stays with them
  useEffect(() => {
    if (!player || !playerItem || !yours.data) return;
    const entries = yours.data.items
      .filter(
        (other): other is LibraryItem => "accessSource" in other && other.publicId !== publicId
      )
      .map(queueEntryFor)
      .filter(entry => entry !== null);
    player.setUpNext(entries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yours.data, playerItem?.id]);

  const toggleSave = async () => {
    if (await actions.toggleSave(publicId, saved)) setSaved(!saved);
  };

  if (item.isLoading) {
    return (
      <div aria-busy aria-label={C.item.loadingFile} className="space-y-3">
        <Skeleton className="aspect-video w-full rounded-prism-21" />
        <Skeleton className="h-6 w-2/3 rounded-full" />
        <Skeleton className="h-4 w-1/3 rounded-full" />
      </div>
    );
  }
  if (item.isError || !data) {
    return (
      <EmptyState
        icon={FileX}
        title={C.item.notFoundTitle}
        description={C.item.notFound}
        action={<Button onClick={() => navigate(LIBRARY_PATHS.home)}>{C.back}</Button>}
      />
    );
  }

  const heading = (
    <div className="space-y-1">
      <h2 className="text-[24px] font-semibold leading-tight text-prism-ink md:text-[28px]">
        {data.title}
      </h2>
      <button
        type="button"
        onClick={() => navigate(LIBRARY_PATHS.creator(owner.handle))}
        className="prism-focus flex min-h-touch items-center rounded-prism-13 text-[15px] text-prism-ink-2"
      >
        <OwnerLine owner={owner} />
      </button>
      <p className="text-[14px] text-prism-ink-2">{contentCardMeta(data)}</p>
    </div>
  );

  if (playerItem && player) {
    return (
      <div className="grid gap-[21px] lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-[13px]">
          <MediaPlayer
            item={playerItem}
            resolve={resolve}
            poster={data.cover?.src ?? null}
            creatorName={creatorName}
            onMinimize={() => navigate(-1)}
          />
          {heading}
          <PlayerActions
            item={playerItem}
            resolve={resolve}
            saved={saved}
            onSave={() => void toggleSave()}
            creatorName={creatorName}
          />
          {data.description && (
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-prism-ink">
              {data.description}
            </p>
          )}
        </div>
        <div className="space-y-[21px]">
          <ChapterList
            item={playerItem}
            resolve={resolve}
            className="hidden md:block"
            headingClassName="text-prism-ink-2"
          />
          <UpNextList item={playerItem} creatorName={creatorName} />
        </div>
      </div>
    );
  }

  if (data.kind === "image") {
    const image = photo.data?.playback?.image ?? data.cover;
    return (
      <div className="space-y-[13px]">
        {image ? (
          <PhotoViewer images={[{ src: image.src, srcSet: image.srcSet, alt: data.title }]} />
        ) : (
          <Skeleton className="aspect-square w-full rounded-prism-21" />
        )}
        {heading}
        <SaveButton saved={saved} onToggle={() => void toggleSave()} />
      </div>
    );
  }

  // Documents and files: the public item page has the viewer and the download
  return (
    <div className="space-y-[13px]">
      {data.cover && (
        <img
          src={data.cover.src}
          srcSet={data.cover.srcSet || undefined}
          alt=""
          className="aspect-video w-full rounded-prism-21 object-cover"
        />
      )}
      {heading}
      {data.description && (
        <p className="whitespace-pre-line text-[15px] leading-relaxed text-prism-ink">
          {data.description}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <a href={publicItemUrl(owner.handle, publicId)} target="_blank" rel="noopener noreferrer">
            {C.item.openFile}
            <ExternalLink aria-hidden />
          </a>
        </Button>
        <SaveButton saved={saved} onToggle={() => void toggleSave()} />
      </div>
    </div>
  );
}

function SaveButton({ saved, onToggle }: { saved: boolean; onToggle: () => void }) {
  return (
    <Button variant="secondary" aria-pressed={saved} onClick={onToggle}>
      {saved ? C.item.saved : C.item.save}
    </Button>
  );
}
