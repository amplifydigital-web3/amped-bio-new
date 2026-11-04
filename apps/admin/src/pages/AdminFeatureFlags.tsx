import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { Button, ErrorCard, Skeleton, cn, trpc, trpcClient, type RouterOutputs } from "@repo/ui";
import { retryToast } from "../kit/parts";
import { WordBadge } from "../kit/WordBadge";
import { StakeAllowlistCard } from "./StakeAllowlistCard";

// Feature flags stored in site_settings (packages/constants/src/feature-flags.ts).
// On and Off save a row that every app reads: the API within 15 seconds, the
// editor and the public site on their next page load. Environment drops the row,
// so each app goes back to its own environment variable.

type Flag = RouterOutputs["admin"]["settings"]["listFeatureFlags"][number];
type Choice = "on" | "off" | "env";

const CHOICES: { value: Choice; label: string }[] = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
  { value: "env", label: "Environment" },
];

function choiceOf(flag: Flag): Choice {
  if (flag.override === null) return "env";
  return flag.override ? "on" : "off";
}

function envLine(flag: Flag): string {
  const names = [flag.env.server, flag.env.client, flag.env.landing].filter(Boolean);
  const fallback = names.length ? names.join(", ") : "none";
  return `Environment: ${fallback}. Default ${flag.default ? "on" : "off"}.`;
}

function FlagRow({ flag }: { flag: Flag }) {
  const queryClient = useQueryClient();
  const current = choiceOf(flag);

  const save = useMutation({
    mutationFn: (choice: Choice) =>
      trpcClient.admin.settings.setFeatureFlag.mutate({
        key: flag.key,
        value: choice === "env" ? null : choice === "on",
      }),
    onSuccess: (_data, choice) => {
      toast.success(
        choice === "env"
          ? `${flag.label} follows the environment again`
          : `${flag.label} turned ${choice}`
      );
      void queryClient.invalidateQueries({
        queryKey: trpc.admin.settings.listFeatureFlags.queryKey(),
      });
    },
    onError: (_error, choice) => {
      retryToast(`${flag.label} did not change`, () => save.mutate(choice));
    },
  });

  return (
    <li className="flex flex-col gap-3 border-t border-prism-line px-4 py-4 first:border-t-0 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2 text-prism-label font-semibold text-prism-ink">
          {flag.label}
          <span className="font-prism-mono text-prism-code-sm font-normal text-prism-ink-2">
            {flag.key}
          </span>
          <WordBadge tone={flag.scope === "public" ? "nav" : "ink"}>
            {flag.scope === "public" ? "Apps and API" : "API only"}
          </WordBadge>
          {flag.serverValue !== null && (
            <WordBadge tone={flag.serverValue ? "success" : "neutral"}>
              {flag.serverValue ? "On in the API" : "Off in the API"}
            </WordBadge>
          )}
        </p>
        <p className="text-prism-meta text-prism-ink-2">{flag.description}</p>
        <p className="text-prism-meta text-prism-ink-2">{envLine(flag)}</p>
      </div>
      <div
        role="radiogroup"
        aria-label={`${flag.label} value`}
        className="flex shrink-0 gap-1 rounded-prism-13 bg-white/60 p-1"
      >
        {CHOICES.map(choice => (
          <Button
            key={choice.value}
            role="radio"
            aria-checked={current === choice.value}
            size="sm"
            variant={current === choice.value ? "default" : "ghost"}
            disabled={save.isPending}
            className={cn(current === choice.value && "pointer-events-none")}
            onClick={() => save.mutate(choice.value)}
          >
            {choice.label}
          </Button>
        ))}
      </div>
    </li>
  );
}

export function AdminFeatureFlags() {
  const flags = useQuery(trpc.admin.settings.listFeatureFlags.queryOptions());

  return (
    <div className="flex flex-col gap-5 font-prism">
      <p className="flex items-start gap-2 rounded-prism-13 bg-prism-warning-bg p-3 text-prism-meta text-prism-warning-ink">
        <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        Changes reach the API within 15 seconds and the editor and public site on their next page
        load. Environment drops the saved value, so each app uses its own environment variable
        again.
      </p>
      {flags.isPending ? (
        <div aria-busy className="space-y-2">
          <Skeleton delayMs={400} className="h-20 w-full !rounded-prism-21" />
          <Skeleton delayMs={400} className="h-20 w-full !rounded-prism-21" />
        </div>
      ) : flags.isError ? (
        <ErrorCard
          title="Feature flags did not load"
          cause="The flags could not be read. Try again."
          retryLabel="Retry"
          onRetry={() => void flags.refetch()}
        />
      ) : (
        <ul aria-label="Feature flags" className="prism-glass-clear !rounded-prism-21">
          {flags.data.map(flag => (
            <FlagRow key={flag.key} flag={flag} />
          ))}
        </ul>
      )}
      <StakeAllowlistCard />
    </div>
  );
}
