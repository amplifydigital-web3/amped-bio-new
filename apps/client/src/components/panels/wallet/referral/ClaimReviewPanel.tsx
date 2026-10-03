import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { AmountWell, Button, Checkbox, Notice, ReviewSlab, SidePanel, StepBar } from "@repo/ui";
import { ComplianceCard } from "../../explore/pool-panel/sections";
import { REFERRAL_SYMBOL } from "./shared";

export type ClaimTarget = {
  // Title of the panel: "Jonah Kim joined" or "Joined through @rob"
  title: string;
  byline?: React.ReactNode;
  art?: React.ReactNode;
  amount: number;
  // Value of the For row
  forLabel: string;
};

/**
 * Screen Review 060 (D24): a referral claim is a money flow. Claim reward
 * opens Review in the calm value panel; nothing is sent in one click.
 *
 * Amped.Bio's affiliate wallet sends the reward, so the creator signs nothing
 * and pays no network fee. The board's Confirm in wallet step, Network fee row
 * and wallet note are left out for that reason.
 */
export function ClaimReviewPanel({
  target,
  onOpenChange,
  onClaim,
  claiming,
  failed,
}: {
  target: ClaimTarget | null;
  onOpenChange: (open: boolean) => void;
  onClaim: () => void;
  claiming: boolean;
  failed: boolean;
}) {
  const [agreed, setAgreed] = useState(false);
  const amount = target ? target.amount.toLocaleString("en-US") : "0";

  return (
    <SidePanel
      open={!!target}
      onOpenChange={open => {
        if (!open) setAgreed(false);
        onOpenChange(open);
      }}
      calm
      dismissible={!claiming}
      eyebrow="Referral reward"
      title={target?.title ?? ""}
      byline={target?.byline}
      art={target?.art}
      footer={
        <Button
          variant="commit"
          size="lg"
          className="w-full"
          disabled={!agreed || claiming}
          aria-busy={claiming}
          onClick={onClaim}
        >
          {claiming ? (
            <Loader2 aria-hidden className="motion-safe:animate-spin" />
          ) : (
            <Download aria-hidden />
          )}
          {claiming ? "Claiming" : `Claim ${amount} ${REFERRAL_SYMBOL}`}
        </Button>
      }
    >
      {target && (
        <>
          <StepBar steps={["Reward", "Review"]} current={1} />
          <AmountWell label="You claim" value={amount} unit={REFERRAL_SYMBOL} calm />
          {failed && (
            <Notice variant="error" title="The claim did not go through">
              <p>Try again in a few minutes.</p>
            </Notice>
          )}
          <ReviewSlab
            rows={[
              { label: "You claim", value: `${amount} ${REFERRAL_SYMBOL}` },
              { label: "For", value: target.forLabel },
            ]}
          />
          <ComplianceCard />
          {/* 060 claim checkbox line, approved 30 Sep */}
          <Checkbox checked={agreed} onCheckedChange={setAgreed} required>
            I understand the claim sends this referral reward to my wallet. (Required)
          </Checkbox>
        </>
      )}
    </SidePanel>
  );
}
