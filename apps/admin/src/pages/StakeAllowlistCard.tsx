import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, ErrorCard, Input, Skeleton, trpc, trpcClient } from "@repo/ui";
import { retryToast } from "../kit/parts";
import { WordBadge } from "../kit/WordBadge";

// Stake rules pilot (Build Board #21, access gating spec 6). Creator user ids whose
// Pool fans and Fans with a minimum stake rules are live while counsel reviews.
// Saved in site_settings (access_stake_kinds_allowlist). The API reads it on every
// stake check. Use environment drops the row, so ACCESS_STAKE_KINDS_ALLOWLIST applies.

const IDS_PATTERN = /^\s*\d+(\s*,\s*\d+)*\s*$/;

/** "3, 10,11" to [3, 10, 11]; an empty field is an empty list; anything else is null */
function parseCreatorIds(text: string): number[] | null {
  if (text.trim() === "") return [];
  if (!IDS_PATTERN.test(text)) return null;
  const ids = text.split(",").map(value => Number(value.trim()));
  return ids.every(id => Number.isSafeInteger(id) && id > 0) ? ids : null;
}

export function StakeAllowlistCard() {
  const queryClient = useQueryClient();
  const allowlist = useQuery(trpc.admin.settings.getStakeKindsAllowlist.queryOptions());
  const [text, setText] = useState("");

  useEffect(() => {
    if (allowlist.data) setText(allowlist.data.userIds.join(", "));
  }, [allowlist.data]);

  const save = useMutation({
    mutationFn: (userIds: number[] | null) =>
      trpcClient.admin.settings.setStakeKindsAllowlist.mutate({ userIds }),
    onSuccess: (_data, userIds) => {
      toast.success(
        userIds === null
          ? "Stake rules pilot follows the environment again"
          : `Stake rules pilot saved with ${userIds.length} creators`
      );
      void queryClient.invalidateQueries({
        queryKey: trpc.admin.settings.getStakeKindsAllowlist.queryKey(),
      });
    },
    onError: (_error, userIds) => {
      retryToast("The stake rules pilot did not change", () => save.mutate(userIds));
    },
  });

  if (allowlist.isPending) {
    return <Skeleton delayMs={400} className="h-40 w-full !rounded-prism-21" />;
  }
  if (allowlist.isError) {
    return (
      <ErrorCard
        title="The stake rules pilot did not load"
        cause="The list could not be read. Try again."
        retryLabel="Retry"
        onRetry={() => void allowlist.refetch()}
      />
    );
  }

  const data = allowlist.data;
  const parsed = parseCreatorIds(text);
  const unchanged = data.source === "setting" && text === data.userIds.join(", ");

  return (
    <section
      aria-labelledby="stake-pilot-title"
      className="prism-glass-clear flex flex-col gap-3 !rounded-prism-21 px-4 py-4"
    >
      <div className="space-y-1">
        <h2
          id="stake-pilot-title"
          className="flex flex-wrap items-center gap-2 text-prism-label font-semibold text-prism-ink"
        >
          Stake rules pilot
          <span className="font-prism-mono text-prism-code-sm font-normal text-prism-ink-2">
            access_stake_kinds_allowlist
          </span>
          <WordBadge tone={data.source === "setting" ? "nav" : "neutral"}>
            {data.source === "setting" ? "Saved value" : "Environment"}
          </WordBadge>
        </h2>
        <p className="text-prism-meta text-prism-ink-2">
          Creators on this list can use Pool fans and Fans with a minimum stake while counsel
          reviews. Everyone else sees them as not available yet. The API applies a change on the
          next check.
        </p>
        <p className="text-prism-meta text-prism-ink-2">
          Environment: ACCESS_STAKE_KINDS_ALLOWLIST ({data.environmentValue.trim() || "empty"}).
        </p>
      </div>

      {data.creators.length > 0 ? (
        <ul aria-label="Creators on the pilot" className="flex flex-wrap gap-2">
          {data.creators.map(creator => (
            <li key={creator.id}>
              <WordBadge tone={creator.found ? "ink" : "warning"}>
                {creator.found
                  ? `${creator.handle ? `@${creator.handle}` : "No handle"} (${creator.id})`
                  : `Unknown user ${creator.id}`}
              </WordBadge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-prism-meta text-prism-ink-2">No creator is on the pilot.</p>
      )}

      <form
        className="flex flex-col gap-2 md:flex-row md:items-end"
        onSubmit={event => {
          event.preventDefault();
          if (parsed) save.mutate(parsed);
        }}
      >
        <div className="min-w-0 flex-1">
          <Input
            label="Creator user ids, comma separated"
            inputMode="numeric"
            value={text}
            onChange={event => setText(event.target.value)}
            error={
              parsed === null
                ? "Use user ids separated by commas, for example 3, 10, 11."
                : undefined
            }
            helper="Save an empty field to turn stake rules off for every creator."
          />
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="submit" size="sm" disabled={parsed === null || unchanged || save.isPending}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={data.source === "environment" || save.isPending}
            onClick={() => save.mutate(null)}
          >
            Use environment
          </Button>
        </div>
      </form>
    </section>
  );
}
