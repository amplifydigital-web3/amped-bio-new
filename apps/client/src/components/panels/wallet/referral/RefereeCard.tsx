import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { PROCESSING_TXID } from "@repo/constants";
import { Button, trpc, trpcClient, useAuth } from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { TestnetLine } from "../../explore/pool-panel/sections";
import { ClaimReviewPanel } from "./ClaimReviewPanel";
import { UNAVAILABLE, formatReward, profileUrl, txUrl, walletsLine } from "./shared";

/**
 * Screen Review 060 I08, I09: the referee card, full width at the top of Get
 * tREVO, shown only when the creator joined through an invite link. Reward and
 * Claim wording is kept (D1). Claim opens the same Review panel as the Invite
 * card (D24).
 */
export default function RefereeCard() {
  const { authUser } = useAuth();
  const queryClient = useQueryClient();
  const [reviewing, setReviewing] = useState(false);

  const { data } = useQuery({
    ...trpc.referral.myReferrer.queryOptions(),
    enabled: !!authUser,
  });

  const claim = useMutation({
    mutationFn: (referralId: number) =>
      trpcClient.referral.claimRefereeReward.mutate({ referralId }),
    onSuccess: async result => {
      setReviewing(false);
      const href = txUrl(result.txid);
      toast.add({
        type: "success",
        title: "Reward claimed",
        actionProps: href
          ? { children: "View", onClick: () => window.open(href, "_blank", "noopener") }
          : undefined,
      });
      await queryClient.invalidateQueries({ queryKey: trpc.referral.myReferrer.queryKey() });
    },
  });

  if (!authUser || !data) return null;

  const { referrer } = data;
  const referrerLabel = referrer.handle ? `@${referrer.handle}` : referrer.name;
  const byline = (
    <>
      Joined through{" "}
      {referrer.handle ? (
        <a
          href={profileUrl(referrer.handle)}
          target="_blank"
          rel="noopener noreferrer"
          className="prism-focus -my-3 inline-flex min-h-touch items-center rounded-prism-5 text-prism-nav hover:underline"
        >
          @{referrer.handle}
        </a>
      ) : (
        referrer.name
      )}
    </>
  );

  // Claimed: one 55 row with the transaction link
  if (data.txid && data.txid !== PROCESSING_TXID) {
    const href = txUrl(data.txid);
    return (
      <div className="prism-glass-clear flex min-h-commit flex-wrap items-center gap-3 !rounded-prism-21 px-[21px] py-2 font-prism sm:px-[34px]">
        <CheckCircle2 aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-success" />
        <p className="flex-1 text-prism-label font-semibold text-prism-ink">
          Referral reward claimed
        </p>
        {href && (
          <Button asChild variant="ghost" className="-mr-3">
            <a href={href} target="_blank" rel="noopener noreferrer">
              View transaction
              <ExternalLink aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </Button>
        )}
      </div>
    );
  }

  const processing = data.txid === PROCESSING_TXID;
  const available = data.affiliateWalletBalance?.hasBalance !== false;
  const ready = !processing && data.walletsLinked && available;

  let body: React.ReactNode;
  if (processing) {
    body = (
      <p className="mt-1 inline-flex items-center gap-2 text-prism-body text-prism-ink">
        <Clock aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
        Processing your reward
      </p>
    );
  } else if (!data.walletsLinked) {
    body = (
      <p className="mt-1 text-prism-body text-prism-ink">
        {walletsLine(referrer.handle, referrer.name)}
      </p>
    );
  } else {
    body = (
      <>
        <p className="mt-1 text-prism-body text-prism-ink">
          {available
            ? `Your ${formatReward(data.refereeReward)} referral reward is ready to claim.`
            : UNAVAILABLE}
        </p>
        <p className="mt-1 text-prism-meta text-prism-ink-2">
          If you do not claim it, it is sent to your wallet automatically.
        </p>
      </>
    );
  }

  return (
    <section
      aria-labelledby="referee-title"
      className="prism-glass-clear flex flex-col gap-4 !rounded-prism-21 p-[21px] font-prism sm:flex-row sm:items-center sm:px-[34px]"
    >
      <div className="min-w-0 flex-1">
        <h3 id="referee-title" className="text-prism-label font-bold text-prism-ink">
          {byline}
        </h3>
        {body}
        <div className="mt-2">
          <TestnetLine />
        </div>
      </div>
      {ready && (
        <Button
          type="button"
          variant="secondary"
          className="self-start sm:self-center"
          onClick={() => {
            claim.reset();
            setReviewing(true);
          }}
        >
          Claim {formatReward(data.refereeReward)} reward
        </Button>
      )}

      <ClaimReviewPanel
        target={
          reviewing
            ? {
                title: `Joined through ${referrerLabel}`,
                amount: data.refereeReward,
                forLabel: `Joining through ${referrerLabel}`,
              }
            : null
        }
        onOpenChange={open => setReviewing(open)}
        onClaim={() => claim.mutate(data.id)}
        claiming={claim.isPending}
        failed={claim.isError}
      />
    </section>
  );
}
