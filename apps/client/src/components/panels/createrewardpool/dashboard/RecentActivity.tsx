import { Activity, ArrowDown, ArrowUp, Copy, ExternalLink, Plus, Sparkles } from "lucide-react";
import { Button, EmptyState, ErrorCard } from "@repo/ui";
import { Avatar, RowSkeleton, SectionHeader } from "./shared";
import { copyText, fanPageUrl, formatPoolAmount, relativeTime, shortAddress } from "./format";

export interface ActivityEvent {
  id: number;
  eventType: string;
  amount: string;
  transactionHash: string;
  createdAt: string | Date;
  address: string;
  isCreator: boolean;
  handle: string | null;
  avatar: string | null;
}

const VERB: Record<string, string> = {
  stake: "staked",
  unstake: "unstaked",
  claim: "claimed rewards",
};

function EventIcon({ type }: { type: string }) {
  const Icon =
    type === "unstake"
      ? ArrowDown
      : type === "claim"
        ? Sparkles
        : type === "create"
          ? Plus
          : ArrowUp;
  return <Icon aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-value-ink" />;
}

/**
 * Screen Review 069: the latest 10 pool events, person first, with the
 * launch as an event (I14) and claimed rewards from RewardClaimed (Rob, 30
 * Sep). Its own loading, empty and error states.
 */
export function RecentActivity({
  events,
  loading,
  showSkeleton,
  error,
  onRetry,
  symbol,
  explorer,
  creatorAvatar,
  poolLink,
}: {
  events: ActivityEvent[] | undefined;
  loading: boolean;
  showSkeleton: boolean;
  error: boolean;
  onRetry: () => void;
  symbol: string;
  explorer?: string;
  creatorAvatar?: string | null;
  poolLink: string;
}) {
  return (
    <section aria-labelledby="activity-title" className="min-w-0 space-y-1 font-prism">
      <SectionHeader id="activity-title" title="Recent activity">
        <span className="text-prism-meta text-prism-ink-2">Last 10</span>
      </SectionHeader>

      {error ? (
        <ErrorCard
          title="Activity did not load"
          cause="The activity service did not respond. Nothing in your pool changed."
          onRetry={onRetry}
          retryLabel="Retry"
          className="mt-3 !rounded-prism-21"
        />
      ) : loading ? (
        showSkeleton ? (
          <RowSkeleton rows={5} />
        ) : null
      ) : !events?.length ? (
        <EmptyState
          icon={Activity}
          title="No activity yet"
          description="Stakes and unstakes in your pool show here."
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => void copyText(poolLink, "Link copied")}
            >
              <Copy aria-hidden />
              Copy pool link
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-prism-line">
          {events.map(event => {
            const created = event.eventType === "create";
            const name = event.handle ? `@${event.handle}` : shortAddress(event.address);
            const verb = VERB[event.eventType] ?? "pool activity";
            const amount = formatPoolAmount(event.amount);
            const date = new Date(event.createdAt);
            const when = relativeTime(date);
            const absolute = date.toLocaleString();
            return (
              <li
                key={event.id}
                className="flex min-h-[55px] items-center gap-3 py-2"
                aria-label={`${created ? "You created the pool" : `${name} ${verb}`} ${amount} ${symbol}, ${when}`}
              >
                <Avatar src={created ? creatorAvatar : event.avatar} handle={event.handle} />
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-1.5 text-prism-label">
                    <EventIcon type={event.eventType} />
                    {created ? (
                      <span className="font-semibold text-prism-ink">You created the pool</span>
                    ) : (
                      <span className="min-w-0 truncate">
                        {event.handle ? (
                          <a
                            href={fanPageUrl(event.handle)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="prism-focus -my-3 inline-block rounded-prism-5 py-3 font-semibold text-prism-ink hover:underline"
                          >
                            {name}
                          </a>
                        ) : (
                          <span className="font-semibold tabular-nums text-prism-ink">{name}</span>
                        )}{" "}
                        <span className="font-medium text-prism-ink-2">{verb}</span>
                      </span>
                    )}
                  </p>
                  <p className="text-prism-meta text-prism-ink-2" title={absolute}>
                    {when}
                    <span className="sr-only">, {absolute}</span>
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-prism-label font-semibold tabular-nums text-prism-ink">
                    {amount}
                  </p>
                  <p className="text-prism-meta text-prism-ink-2">{symbol}</p>
                </div>
                {explorer && (
                  <a
                    href={`${explorer}/tx/${event.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="View transaction on explorer"
                    className="prism-focus inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-full text-prism-ink-2"
                  >
                    <ExternalLink aria-hidden className="h-[21px] w-[21px]" />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
