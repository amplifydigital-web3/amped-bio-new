import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorCard,
  Notice,
  Skeleton,
  TESTNET_NOTICE,
  trpc,
  trpcClient,
} from "@repo/ui";
import { CopyButton } from "../../kit/CopyButton";
import { FieldError, retryToast } from "../../kit/parts";
import { formatCount, shortHex } from "../../kit/format";

// Screen Review 087 I09. Referral reward amounts are a platform wide money
// setting: two wells with a tREVO unit, one Review changes that shows before
// and after, and nothing changes until Change rewards (087 D1).

const AMOUNT = /^\d*\.?\d+$/;
const UNIT = "tREVO";

interface AffiliateWallet {
  success: true;
  address: string;
  balances: { chainId: number; currency: string; formattedBalance: string }[];
}

function RewardWell({
  id,
  label,
  value,
  current,
  onChange,
  error,
  onBlur,
}: {
  id: string;
  label: string;
  value: string;
  current: string | null;
  onChange: (value: string) => void;
  error?: string;
  onBlur: () => void;
}) {
  const noteId = `${id}-note`;
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <label htmlFor={id} className="block text-prism-label font-semibold text-prism-ink">
        {label}
      </label>
      <div className="prism-well flex h-touch items-center gap-2 pl-3 pr-1">
        <input
          id={id}
          inputMode="decimal"
          value={value}
          onChange={event => onChange(event.target.value.replace(/[^\d.]/g, ""))}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          aria-describedby={noteId}
          className="h-full min-w-0 flex-1 bg-transparent text-prism-label tabular-nums text-prism-ink focus:outline-none"
        />
        <span className="prism-chip inline-flex h-9 items-center rounded-full px-3 text-prism-meta font-semibold text-prism-ink">
          {UNIT}
        </span>
      </div>
      {error ? (
        <FieldError id={noteId}>{error}</FieldError>
      ) : (
        <p id={noteId} className="text-prism-meta tabular-nums text-prism-ink-2">
          {current ? `Now ${current} ${UNIT}` : "Not set yet"}
        </p>
      )}
    </div>
  );
}

export function ReferralRewardsCard() {
  const queryClient = useQueryClient();
  const wallet = useQuery(trpc.admin.affiliate.getAffiliateWalletInfo.queryOptions());
  const settings = useQuery(trpc.admin.settings.getAffiliateRewardsStatus.queryOptions());
  const stats = useQuery(trpc.admin.affiliate.getAffiliateStats.queryOptions());

  const current = {
    referrer: settings.data?.referrerReward ?? null,
    referee: settings.data?.refereeReward ?? null,
  };
  const [referrer, setReferrer] = useState("");
  const [referee, setReferee] = useState("");
  const [errors, setErrors] = useState<{ referrer?: string; referee?: string }>({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Wells start from the stored values and follow them after a save
  useEffect(() => {
    setReferrer(current.referrer ?? "");
    setReferee(current.referee ?? "");
  }, [current.referrer, current.referee]);

  const validate = (value: string) =>
    value === "" || AMOUNT.test(value) ? undefined : "Use a number, for example 10 or 2.5.";

  const changes = [
    {
      key: "referrer" as const,
      label: "Referrer reward",
      before: current.referrer,
      after: referrer,
    },
    {
      key: "referee" as const,
      label: "New member reward",
      before: current.referee,
      after: referee,
    },
  ];
  const changed = changes.filter(c => c.after !== "" && c.after !== (c.before ?? ""));

  const openReview = () => {
    const next = { referrer: validate(referrer), referee: validate(referee) };
    setErrors(next);
    if (next.referrer || next.referee || changed.length === 0) return;
    setReviewOpen(true);
  };

  const apply = async () => {
    setSaving(true);
    try {
      for (const change of changed) {
        if (change.key === "referrer") {
          await trpcClient.admin.settings.setAffiliateReferrerReward.mutate({
            amount: change.after,
          });
        } else {
          await trpcClient.admin.settings.setAffiliateRefereeReward.mutate({
            amount: change.after,
          });
        }
      }
      setReviewOpen(false);
      toast.success("Referral rewards changed");
    } catch {
      setReviewOpen(false);
      retryToast("Referral rewards did not change", () => void apply());
    } finally {
      setSaving(false);
      void queryClient.invalidateQueries({
        queryKey: trpc.admin.settings.getAffiliateRewardsStatus.queryKey(),
      });
      void queryClient.invalidateQueries({
        queryKey: trpc.admin.affiliate.getAffiliateWalletInfo.queryKey(),
      });
    }
  };

  const info =
    wallet.data && "success" in wallet.data && wallet.data.success
      ? (wallet.data as unknown as AffiliateWallet)
      : null;
  const balance = info?.balances[0];

  return (
    <section
      aria-labelledby="referral-title"
      className="prism-glass-clear flex flex-col gap-[13px] !rounded-prism-21 p-5 font-prism"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="referral-title" className="text-prism-panel-title text-prism-ink">
          Referral rewards
        </h3>
        {balance && (
          <p className="text-prism-meta tabular-nums text-prism-ink-2">
            Balance{" "}
            <span className="font-semibold text-prism-ink">
              {(Number(balance.formattedBalance) / 1e18).toLocaleString("en-US", {
                maximumFractionDigits: 4,
              })}{" "}
              {balance.currency}
            </span>
          </p>
        )}
      </div>

      {wallet.isPending ? (
        <Skeleton delayMs={400} className="h-4 w-48" />
      ) : wallet.isError || !info ? (
        <ErrorCard
          title="Rewards wallet did not load"
          cause="The balance could not be read. Try again."
          retryLabel="Retry"
          onRetry={() => void wallet.refetch()}
        />
      ) : (
        <p className="flex flex-wrap items-center gap-2 text-prism-meta text-prism-ink-2">
          Rewards wallet
          <span className="font-prism-mono text-prism-code-sm font-semibold text-prism-ink">
            {shortHex(info.address)}
          </span>
          <CopyButton value={info.address} label="Copy rewards wallet address" size="inline" />
        </p>
      )}

      {stats.data && (
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-prism-meta tabular-nums">
          {[
            ["Referrals", stats.data.totalReferrals],
            ["Rewarded", stats.data.rewardedReferrals],
            ["Pending", stats.data.pendingReferrals],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-prism-ink-2">{label}</dt>
              <dd className="text-prism-label font-semibold text-prism-ink">
                {formatCount(value as number)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {settings.isError ? (
        <ErrorCard
          title="Reward amounts did not load"
          retryLabel="Retry"
          onRetry={() => void settings.refetch()}
        />
      ) : (
        <div className="flex flex-col gap-5 sm:flex-row">
          <RewardWell
            id="referrer-reward"
            label="Referrer reward"
            value={referrer}
            current={current.referrer}
            onChange={setReferrer}
            error={errors.referrer}
            onBlur={() => setErrors(e => ({ ...e, referrer: validate(referrer) }))}
          />
          <RewardWell
            id="referee-reward"
            label="New member reward"
            value={referee}
            current={current.referee}
            onChange={setReferee}
            error={errors.referee}
            onBlur={() => setErrors(e => ({ ...e, referee: validate(referee) }))}
          />
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
        <p className="text-prism-meta text-prism-ink-2">
          Nothing changes until you review and confirm.
        </p>
        <Button
          variant="secondary"
          onClick={openReview}
          disabled={settings.isPending || changed.length === 0}
        >
          Review changes
        </Button>
      </div>

      <Dialog open={reviewOpen} onOpenChange={open => !saving && setReviewOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review reward changes</DialogTitle>
            <DialogDescription>
              New amounts apply to referrals completed after you confirm. Rewards already paid do
              not change.
            </DialogDescription>
          </DialogHeader>
          <div className="prism-slab overflow-hidden">
            <table aria-label="Reward changes" className="w-full text-left">
              <thead>
                <tr className="h-touch text-prism-eyebrow uppercase text-prism-ink-2">
                  <th scope="col" className="px-4 font-semibold">
                    Reward
                  </th>
                  <th scope="col" className="px-4 text-right font-semibold">
                    Now
                  </th>
                  <th scope="col" className="px-4 text-right font-semibold">
                    New
                  </th>
                </tr>
              </thead>
              <tbody>
                {changes.map(change => {
                  const same = change.after === "" || change.after === (change.before ?? "");
                  return (
                    <tr key={change.key} className="h-touch border-t border-prism-line">
                      <td className="px-4 py-2 text-prism-label text-prism-ink">
                        {change.label}
                        {same && (
                          <span className="block text-prism-meta text-prism-ink-2">No change</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 text-right text-prism-label tabular-nums text-prism-ink-2">
                        {change.before ? `${change.before} ${UNIT}` : "Not set"}
                        <ArrowRight aria-hidden className="ml-2 inline h-4 w-4" />
                      </td>
                      <td className="whitespace-nowrap px-4 text-right text-prism-label font-bold tabular-nums text-prism-ink">
                        {same
                          ? change.before
                            ? `${change.before} ${UNIT}`
                            : "Not set"
                          : `${change.after} ${UNIT}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Notice variant="warning" title="Testnet only.">
            {TESTNET_NOTICE.replace("Testnet only. ", "")}
          </Notice>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setReviewOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void apply()} disabled={saving} aria-busy={saving || undefined}>
              Change rewards
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
