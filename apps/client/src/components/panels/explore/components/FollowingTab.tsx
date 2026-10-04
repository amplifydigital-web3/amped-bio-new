import { useEffect, useState } from "react";
import { MoreHorizontal, UserMinus, UserPlus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  ErrorCard,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Skeleton,
  trpc,
  type RouterOutputs,
} from "@repo/ui";
import { toast } from "@/components/ui/toast";

type FollowingItem = RouterOutputs["follow"]["listFollowing"]["items"][number];

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function sinceText(date: Date | string) {
  const value = new Date(date);
  const today = new Date();
  if (value.toDateString() === today.toDateString()) return "Since today";
  return `Since ${dateFormat.format(value)}`;
}

function pageUrl(handle: string | null) {
  return `${import.meta.env.VITE_LANDINGPAGE_URL}/${handle ?? ""}`;
}

function Avatar({ item }: { item: FollowingItem }) {
  if (item.image) {
    return (
      <img
        src={item.image}
        alt=""
        className="h-[55px] w-[55px] shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-[55px] w-[55px] shrink-0 items-center justify-center rounded-full bg-prism-nav-tint text-prism-label font-bold text-prism-nav-pressed"
    >
      {(item.name || item.handle || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * Fan Graph (#22) boards fg6 and fg12: the creators this person follows. Only
 * they see this list. Per creator: public list, email updates, Unfollow.
 */
export default function FollowingTab({ onExploreCreators }: { onExploreCreators?: () => void }) {
  const queryClient = useQueryClient();
  const listKey = trpc.follow.listFollowing.queryKey();
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [items, setItems] = useState<FollowingItem[]>([]);
  const [showSkeleton, setShowSkeleton] = useState(false);

  const query = useQuery(trpc.follow.listFollowing.queryOptions(cursor ? { cursor } : undefined));

  useEffect(() => {
    if (!query.data) return;
    setItems(previous => (cursor ? [...previous, ...query.data.items] : query.data.items));
  }, [query.data, cursor]);

  // Skeletons only after 400ms (Doherty)
  useEffect(() => {
    if (!query.isLoading) return setShowSkeleton(false);
    const timer = setTimeout(() => setShowSkeleton(true), 400);
    return () => clearTimeout(timer);
  }, [query.isLoading]);

  const update = useMutation(trpc.follow.update.mutationOptions());
  const unfollow = useMutation(trpc.follow.unfollow.mutationOptions());
  const follow = useMutation(trpc.follow.follow.mutationOptions());

  const refresh = async () => {
    setCursor(undefined);
    await queryClient.invalidateQueries({ queryKey: listKey });
  };

  const setFlag = async (
    item: FollowingItem,
    patch: { showPublicly?: boolean; emailUpdates?: boolean }
  ) => {
    if (!item.handle) return;
    setItems(previous =>
      previous.map(row => (row.creatorId === item.creatorId ? { ...row, ...patch } : row))
    );
    try {
      await update.mutateAsync({ handle: item.handle, ...patch });
    } catch {
      toast.add({ type: "error", title: "Your change was not saved. Try again." });
      await refresh();
    }
  };

  const doUnfollow = async (item: FollowingItem) => {
    if (!item.handle) return;
    try {
      await unfollow.mutateAsync({ handle: item.handle });
      setItems(previous => previous.filter(row => row.creatorId !== item.creatorId));
      toast.add({
        type: "success",
        title: `You unfollowed ${item.name}.`,
        actionProps: {
          children: "Undo",
          onClick: () => {
            void follow
              .mutateAsync({
                handle: item.handle!,
                source: "explore",
                showPublicly: item.showPublicly,
                emailUpdates: item.emailUpdates,
              })
              .then(refresh)
              .catch(() =>
                toast.add({ type: "error", title: "Could not undo. Try again." })
              );
          },
        },
      });
    } catch {
      toast.add({ type: "error", title: "That didn't work. Try again." });
    }
  };

  if (query.isLoading) {
    return showSkeleton ? (
      <div className="grid gap-[21px] md:grid-cols-2 xl:grid-cols-3" aria-busy aria-label="Loading">
        {[0, 1, 2].map(index => (
          <Skeleton key={index} className="h-[233px] rounded-prism-21 motion-reduce:animate-none" />
        ))}
      </div>
    ) : null;
  }

  if (query.isError) {
    return (
      <ErrorCard
        title="Your follows did not load"
        cause="Check your connection."
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (items.length === 0) {
    return (
      <div className="prism-glass-clear rounded-prism-21">
        <EmptyState
          icon={UserPlus}
          title="You don't follow anyone yet"
          description="Follow creators from their page or from Users. Only you see this list."
          action={
            onExploreCreators && (
              <Button size="lg" onClick={onExploreCreators}>
                Explore creators
              </Button>
            )
          }
        />
      </div>
    );
  }

  return (
    <section aria-label="Creators you follow" className="space-y-[21px]">
      <p className="text-prism-body text-prism-ink-2">
        Only you see who you follow. Creators see your name, @handle and photo.
      </p>
      <ul className="grid gap-[21px] md:grid-cols-2 xl:grid-cols-3">
        {items.map(item => (
          <li
            key={item.creatorId}
            className="prism-glass-clear flex flex-col gap-[13px] rounded-prism-21 p-4"
          >
            <div className="flex items-center gap-[13px]">
              <Avatar item={item} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-prism-label font-semibold text-prism-ink">
                    {item.name}
                  </span>
                  {item.poolFan && <Badge variant="secondary">Pool fan</Badge>}
                </div>
                <p className="truncate text-prism-meta text-prism-ink-2">
                  @{item.handle}. {sinceText(item.followedAt)}
                </p>
              </div>
              <Menu>
                <MenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`More for ${item.name}`}
                    className="prism-icon-btn prism-focus shrink-0"
                  >
                    <MoreHorizontal className="h-[18px] w-[18px]" aria-hidden />
                  </button>
                </MenuTrigger>
                <MenuContent align="end">
                  <MenuItem onSelect={() => void doUnfollow(item)}>
                    <UserMinus aria-hidden />
                    Unfollow
                  </MenuItem>
                </MenuContent>
              </Menu>
            </div>
            <div>
              <Checkbox
                checked={item.showPublicly}
                onCheckedChange={checked => void setFlag(item, { showPublicly: checked })}
              >
                Show me on their public list
              </Checkbox>
              <Checkbox
                checked={item.emailUpdates}
                onCheckedChange={checked => void setFlag(item, { emailUpdates: checked })}
              >
                Email me their updates
              </Checkbox>
            </div>
            <Button variant="secondary" asChild>
              <a href={pageUrl(item.handle)} target="_blank" rel="noopener noreferrer">
                View page
              </a>
            </Button>
          </li>
        ))}
      </ul>
      {query.data?.nextCursor && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            disabled={query.isFetching}
            onClick={() => setCursor(query.data?.nextCursor ?? undefined)}
          >
            Show more
          </Button>
        </div>
      )}
      <p className="text-prism-meta text-prism-ink-2">
        Unfollowing is silent. The creator is not told.
      </p>
    </section>
  );
}
