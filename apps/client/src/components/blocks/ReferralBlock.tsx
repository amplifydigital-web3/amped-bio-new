import { Link } from "react-router";
import { Gift } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { useQuery } from "@tanstack/react-query";
import type { ReferralBlock, ThemeConfig } from "@ampedbio/constants";

interface ReferralBlockProps {
  block: ReferralBlock;
  theme: ThemeConfig;
  pageOwnerId: number;
}

export function ReferralBlock({ theme, pageOwnerId }: ReferralBlockProps) {
  const { data: refereeRewardData, isLoading } = useQuery(
    trpc.referral.getRefereeReward.queryOptions(undefined, {
      retry: 1,
    })
  );

  if (isLoading) {
    return (
      <div
        className="w-full px-4 py-3 flex items-center justify-center space-x-2 rounded-lg bg-white/10 backdrop-blur-md"
        style={{
          fontFamily: theme.fontFamily,
          color: theme.fontColor,
        }}
      >
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Loading...</span>
      </div>
    );
  }

  if (!refereeRewardData) {
    return null;
  }

  const userIdHex = `0x${pageOwnerId.toString(16)}`;

  return (
    <Link
      to={`/register?r=${userIdHex}`}
      className="w-full px-4 py-3 flex items-center justify-center space-x-2 rounded-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
      style={{
        backgroundColor: theme.buttonColor,
        fontFamily: theme.fontFamily,
        color: theme.fontColor,
      }}
    >
      <Gift className="w-5 h-5 flex-shrink-0" />
      <span className="text-sm font-medium">
        Create your profile and earn {refereeRewardData.amount || 0} REVO
      </span>
    </Link>
  );
}
