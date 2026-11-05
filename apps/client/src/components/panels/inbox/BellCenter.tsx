import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Bell, Megaphone } from "lucide-react";
import { MEMBERSHIP_COPY, MESSAGE_UI, PROMOTER_COPY } from "@repo/constants";
import {
  BottomSheet,
  BottomSheetContent,
  Button,
  CountBadge,
  EmptyState,
  ErrorCard,
  Skeleton,
  cn,
  trpc,
  trpcClient,
  useAuth,
  type RouterOutputs,
} from "@repo/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { useEditor } from "@/contexts/EditorContext";
import { PersonAvatar } from "./parts";
import { rowTime } from "./util";

type Item = RouterOutputs["notifications"]["list"][number];
const B = MESSAGE_UI.bell;

/**
 * The bell center (spec 8.1 item 3, board m1): the unseen count on the bell; a popover
 * on desktop and a sheet on phones lists the latest 20 alerts, with Mark all as seen.
 * Opening a conversation marks its alerts seen. Replaces the Telegram era InboxButton behind the messages feature flag.
 */
export function BellCenter() {
  const { authUser } = useAuth();
  const queryClient = useQueryClient();
  const phone = useMediaQuery(PHONE_QUERY);
  const { activePanel } = useEditor();
  const [open, setOpen] = useState(false);
  const unseen = useQuery({
    ...trpc.notifications.unseenCount.queryOptions(),
    enabled: !!authUser,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
  });
  const count = unseen.data?.count ?? 0;
  const markAll = useMutation({
    mutationFn: () => trpcClient.notifications.markSeen.mutate({}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.notifications.unseenCount.pathKey() });
      void queryClient.invalidateQueries({ queryKey: trpc.notifications.list.pathKey() });
    },
  });

  const shown = count > 99 ? "99+" : String(count);
  const trigger = (
    <button
      type="button"
      aria-label={count > 0 ? `Notifications, ${shown} new` : B.title}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={phone ? () => setOpen(true) : undefined}
      className={cn(
        "prism-icon-btn prism-focus relative shrink-0",
        activePanel === "inbox" && "prism-lens-thumb"
      )}
    >
      <Bell aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" strokeWidth={1.5} />
      <CountBadge count={count} onIcon />
    </button>
  );

  const list = <BellList open={open} onNavigate={() => setOpen(false)} />;
  const footer = (
    <div className="flex items-center justify-between gap-3 border-t border-prism-line pt-[13px]">
      <Button
        variant="ghost"
        onClick={() => markAll.mutate()}
        disabled={count === 0 || markAll.isPending}
      >
        {B.markAll}
      </Button>
      <OpenInboxButton onNavigate={() => setOpen(false)} />
    </div>
  );

  if (phone) {
    return (
      <>
        {trigger}
        <BottomSheet open={open} onOpenChange={setOpen}>
          <BottomSheetContent title={B.title}>
            {list}
            {footer}
          </BottomSheetContent>
        </BottomSheet>
      </>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[380px] max-w-[calc(100vw-32px)] p-[13px]"
      >
        <h2 className="px-2 pb-2 text-prism-panel-title text-prism-ink">{B.title}</h2>
        {list}
        {footer}
      </PopoverContent>
    </Popover>
  );
}

function OpenInboxButton({ onNavigate }: { onNavigate: () => void }) {
  const navigate = useNavigate();
  return (
    <Button
      variant="secondary"
      onClick={() => {
        onNavigate();
        navigate("/inbox");
      }}
    >
      {B.viewAll}
    </Button>
  );
}

function BellList({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const navigate = useNavigate();
  const list = useQuery({ ...trpc.notifications.list.queryOptions(), enabled: open });
  if (list.isLoading) {
    return (
      <div aria-busy className="space-y-2 py-2">
        {[0, 1, 2].map(i => (
          <Skeleton key={i} className="h-commit w-full rounded-prism-13" />
        ))}
      </div>
    );
  }
  if (list.isError) {
    return <ErrorCard title={B.error} onRetry={() => void list.refetch()} />;
  }
  const items = list.data ?? [];
  if (items.length === 0) {
    return <EmptyState icon={Bell} title={B.empty} description={B.emptyBody} className="py-5" />;
  }
  const target = (item: Item) =>
    item.kind === "PROMOTER_CODE"
      ? // C12: the promoter's codes live under Content, Store, Sales
        "/content?t=store"
      : item.kind === "MEMBERSHIP_RENEWAL"
        ? // MB-1 (CK-D3): Wallet, Buy USDC, prefilled with the charge
          `/wallet?fund=usdc${item.renewal ? `&need=${item.renewal.need}` : ""}&returnTo=${encodeURIComponent("/library/memberships")}`
        : item.kind === "BROADCAST"
          ? `/inbox?tab=broadcast${item.broadcastId ? `&b=${item.broadcastId}` : ""}`
          : `/inbox?tab=${item.kind === "REQUEST" ? "requests" : "primary"}&c=${item.conversationId}`;
  return (
    <ul className="max-h-[420px] overflow-y-auto py-1">
      {items.map(item => {
        const handle = item.actor?.handle ?? B.someone;
        const text =
          item.kind === "PROMOTER_CODE"
            ? PROMOTER_COPY.bell(handle)
            : item.kind === "MEMBERSHIP_RENEWAL"
              ? item.renewal?.graceDay
                ? MEMBERSHIP_COPY.bell.pastDue(handle, item.renewal.graceDay)
                : MEMBERSHIP_COPY.bell.notReady(handle)
              : item.kind === "BROADCAST"
                ? B.broadcast(handle)
                : item.kind === "REQUEST"
                  ? B.request(handle)
                  : B.message(handle, item.count);
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => {
                onNavigate();
                navigate(target(item));
              }}
              className="prism-focus flex min-h-commit w-full items-center gap-3 rounded-prism-13 px-2 py-2 text-left hover:bg-prism-nav-tint"
            >
              {item.kind === "BROADCAST" && !item.actor ? (
                <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-prism-nav-tint">
                  <Megaphone aria-hidden className="h-5 w-5 text-prism-nav" />
                </span>
              ) : (
                <PersonAvatar person={item.actor} size={34} />
              )}
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-prism-label text-prism-ink",
                    item.seen ? "font-medium" : "font-bold"
                  )}
                >
                  {text}
                </span>
                <span className="block text-prism-meta text-prism-ink-2">{rowTime(item.at)}</span>
              </span>
              {!item.seen && (
                <span className="h-2 w-2 shrink-0 rounded-full bg-prism-nav">
                  <span className="sr-only">New</span>
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
