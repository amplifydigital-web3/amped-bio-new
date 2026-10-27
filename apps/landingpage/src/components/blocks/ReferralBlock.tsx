import { Gift } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useQuery } from "@tanstack/react-query";
import type { ReferralBlock as ReferralBlockT, ThemeConfig } from "@repo/constants";
import { useReferralHandler } from "@/hooks/useReferralHandler";
import { CreatorButton } from "./frame";

interface ReferralBlockProps {
  block: ReferralBlockT;
  theme: ThemeConfig;
  pageOwnerId: number;
}

// Screen Review 040 I05, I16 and D2: the shared button anatomy in the creator's
// button style. The label never carries an amount or earn wording; the reward,
// the tREVO unit and the testnet line show in the sign up flow. No active
// program (reward unset or 0), no button.
export function ReferralBlock({ theme, pageOwnerId }: ReferralBlockProps) {
  const { data, isLoading } = useQuery(
    trpc.referral.getRefereeReward.queryOptions(undefined, { retry: 1 })
  );
  const { handleReferrerClick } = useReferralHandler();

  if (isLoading) {
    return (
      <div
        aria-hidden
        className="h-commit w-full rounded-prism-13 bg-[rgba(22,21,43,0.10)] motion-safe:animate-pulse"
      />
    );
  }
  if (!data || !data.amount) return null;

  return (
    <CreatorButton
      theme={theme}
      icon={<Gift className="h-[21px] w-[21px]" />}
      label="Create your own Amped.Bio page"
      onClick={() => handleReferrerClick(pageOwnerId)}
    />
  );
}
