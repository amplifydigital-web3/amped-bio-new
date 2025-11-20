import { lazy, Suspense, useState, useMemo } from "react";
import { Users, Trophy, Coins, TrendingUp, Gift, Target } from "lucide-react";
import { ProfileSection } from "./ProfileSection";
import { useAccount } from "wagmi";
import { useWalletContext } from "@/contexts/WalletContext";
import { type StatBoxProps } from "./types";
import { useWalletStats } from "./hooks/useWalletStats";

const WalletBalance = lazy(() => import("./WalletBalance"));
const StakedPoolsSection = lazy(() => import("./StakedPoolsSection"));
const ProfileTabs = lazy(() => import("./ProfileTabs"));
// const ProfileOptionsDialog = lazy(() => import("./dialogs/ProfileOptionsDialog"));
const LaunchPoolAd = lazy(() => import("./LaunchPoolAd"));

export function MyWalletPanel() {
  const wallet = useWalletContext();

  const { address } = useAccount();
  const [showProfileOptions, setShowProfileOptions] = useState(false);

  // Get wallet stats from backend
  const { stats, isLoading: statsLoading } = useWalletStats();

  // Create stats for the wallet stats section
  const walletStats = useMemo<StatBoxProps[]>(
    () => [
      {
        icon: TrendingUp,
        label: "Total REVO",
        value: wallet.balance?.data?.formatted
          ? `${parseFloat(wallet.balance?.data!.formatted).toFixed(8)} ${wallet.balance?.data?.symbol ?? "REVO"}`
          : "-",
        tooltip: "Total amount of REVO tokens in your wallet",
        color: "bg-blue-100 text-blue-600",
        soon: false,
      },
      {
        icon: Coins,
        label: "My Stake",
        value: stats.myStake ? `${parseFloat(stats.myStake).toFixed(8)} REVO` : "0 REVO",
        tooltip: "Total amount of REVO tokens you have staked across all pools",
        color: "bg-green-100 text-green-600",
        soon: false,
      },
      {
        icon: Users,
        label: "Staked to Me",
        value: stats.stakedToMe ? `${parseFloat(stats.stakedToMe).toFixed(8)} REVO` : "0 REVO",
        tooltip: "Total amount of REVO staked in pools you have created",
        color: "bg-purple-100 text-purple-600",
        soon: false,
      },
      {
        icon: Gift,
        label: "Earnings to Date",
        value: "- REVO",
        tooltip: "Total rewards earned from all your staking activities",
        color: "bg-orange-100 text-orange-600",
        soon: true,
      },
      {
        icon: Trophy,
        label: "Stakers Supporting You",
        value: stats.stakersSupportingMe ? stats.stakersSupportingMe.toString() : "0",
        tooltip: "Number of users who have staked in pools you created",
        color: "bg-indigo-100 text-indigo-600",
        soon: false,
      },
      {
        icon: Target,
        label: "Creator Pools Joined",
        value: stats.creatorPoolsJoined?.toString() || "0",
        tooltip: "Number of creator pools you have joined",
        color: "bg-pink-100 text-pink-600",
        soon: false,
      },
    ],
    [wallet.balance?.data?.formatted, wallet.balance?.data?.symbol, stats, statsLoading]
  );

  // Connected view (existing wallet interface)
  const loggedInView = (
    <div className="h-full overflow-y-auto">
      <div className="p-6 md:w-4/5 md:mx-auto">
        <div className="space-y-6">
          <ProfileSection
            loading={!address}
            address={address}
            walletStats={walletStats}
            onProfileOptionsClick={() => setShowProfileOptions(true)}
          />

          <Suspense>
            <WalletBalance loading={!address} />
          </Suspense>

          <Suspense>
            <ProfileTabs loading={!address} />
          </Suspense>

          <Suspense>
            <StakedPoolsSection />
          </Suspense>

          <Suspense>
            <LaunchPoolAd />
          </Suspense>
        </div>

        {/* <Suspense fallback={null}>
          <ProfileOptionsDialog open={showProfileOptions} onOpenChange={setShowProfileOptions} />
        </Suspense> */}
      </div>
    </div>
  );

  return loggedInView;
}
