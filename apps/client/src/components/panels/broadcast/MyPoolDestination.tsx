import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useChainId } from "wagmi";
import { Megaphone } from "lucide-react";
import { BROADCAST_UI } from "@repo/constants";
import { Button, trpc } from "@repo/ui";
import { CreatorPoolPanel } from "../createrewardpool/CreatorPoolPanel";
import { BROADCAST_ON, shortTime } from "./utils";

/**
 * My Pool, Overview: one Broadcast card with the last broadcast and a Broadcast button
 * (M9, spec 8.6 item 4). The button opens Inbox, Broadcast, New broadcast with Pool
 * stakers picked. The Broadcasts tab moved to the Inbox; the Telegram group tab ended in M8.
 */
export function BroadcastCard({ chainId }: { chainId: string }) {
  const navigate = useNavigate();
  const overview = useQuery({
    ...trpc.broadcast.creator.overview.queryOptions({ chainId }),
    enabled: BROADCAST_ON,
    retry: 1,
  });
  if (!BROADCAST_ON || !overview.data?.pool) return null;
  const { last } = overview.data;
  const S = BROADCAST_UI.myPoolCard;

  return (
    <section
      aria-labelledby="my-pool-broadcast"
      className="prism-slab mx-4 mt-5 flex flex-wrap items-center justify-between gap-4 rounded-prism-21 p-5 md:mx-6"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Megaphone
          aria-hidden
          className="mt-0.5 h-5 w-5 shrink-0 text-prism-nav"
          strokeWidth={1.5}
        />
        <div className="min-w-0">
          <h2 id="my-pool-broadcast" className="text-prism-label font-semibold text-prism-ink">
            {S.title}
          </h2>
          <p className="text-prism-meta text-prism-ink-2">
            {last ? (
              <>
                {S.last}: <span className="font-semibold text-prism-ink">{last.title}</span>,{" "}
                {shortTime(last.createdAt)}
              </>
            ) : (
              S.body
            )}
          </p>
        </div>
      </div>
      <Button onClick={() => navigate("/inbox/broadcast/new?audience=pool")}>
        <Megaphone aria-hidden />
        {S.button}
      </Button>
    </section>
  );
}

export function MyPoolDestination() {
  const chainId = useChainId().toString();
  return (
    <div className="flex flex-col">
      <BroadcastCard chainId={chainId} />
      <CreatorPoolPanel />
    </div>
  );
}
