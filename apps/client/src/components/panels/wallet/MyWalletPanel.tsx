import { lazy, Suspense, useState, useMemo } from "react";
import { Users, Trophy, Coins, TrendingUp, Gift, Target } from "lucide-react";
import { ProfileSection } from "./ProfileSection";
import { useWalletContext } from "@/contexts/WalletContext";
import { type StatBoxProps } from "./types";
import { useWalletStats } from "./hooks/useWalletStats";
import { useRnsSubPage } from "./rns/useRnsRoute";
import { RnsSubPage } from "./rns/RnsTab";
import { getChainConfig } from "@repo/web3";
import { appChainId } from "@/utils/appChain";

const WalletBalance = lazy(() => import("./WalletBalance"));
// Screen Review 059: Stakes replaces StakedPoolsSection on the Wallet
const StakesCard = lazy(() => import("./stakes/StakesCard"));
const ProfileTabs = lazy(() => import("./ProfileTabs"));
// Screen Review 060: referral cards live in the Get tREVO section
const InviteCard = lazy(() => import("./referral/InviteCard"));
const RefereeCard = lazy(() => import("./referral/RefereeCard"));
// const ProfileOptionsDialog = lazy(() => import("./dialogs/ProfileOptionsDialog"));
const LaunchPoolAd = lazy(() => import("./LaunchPoolAd"));

export function MyWalletPanel() {
  const wallet = useWalletContext();
  const [showProfileOptions, setShowProfileOptions] = useState(false);

  // Get wallet stats from backend
  const { stats, isLoading: statsLoading } = useWalletStats();

  // Units follow the app network: tREVO on testnet, never a bare REVO (QA-026).
  // Interim until rows 049 and 050 replace these tiles.
  const symbol =
    getChainConfig(Number(appChainId()))?.nativeCurrency.symbol ??
    wallet.balance?.data?.symbol ??
    "tREVO";

  // Create stats for the wallet stats section
  const walletStats = useMemo<StatBoxProps[]>(
    () => [
      {
        icon: TrendingUp,
        label: `Total ${symbol}`,
        value: wallet.balance?.data?.formatted
          ? `${parseFloat(wallet.balance?.data!.formatted).toFixed(8)} ${symbol}`
          : "-",
        tooltip: `Total amount of ${symbol} in your wallet`,
        color: "bg-blue-100 text-blue-600",
        soon: false,
      },
      {
        icon: Coins,
        label: "My Stake",
        value: stats.myStake ? `${parseFloat(stats.myStake).toFixed(8)} ${symbol}` : `0 ${symbol}`,
        tooltip: `Total amount of ${symbol} you have staked across all pools`,
        color: "bg-green-100 text-green-600",
        soon: false,
      },
      {
        icon: Users,
        label: "Staked to Me",
        value: stats.stakedToMe
          ? `${parseFloat(stats.stakedToMe).toFixed(8)} ${symbol}`
          : `0 ${symbol}`,
        tooltip: `Total amount of ${symbol} staked in pools you have created`,
        color: "bg-purple-100 text-purple-600",
        soon: false,
      },
      {
        icon: Gift,
        label: "Earnings to Date",
        value: `- ${symbol}`,
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
    [wallet.balance?.data?.formatted, symbol, stats, statsLoading]
  );

  // 100 I07, 111 I01: the address view and the RNS name page replace the
  // Wallet summary and tabs, with a back lens to the RNS tab
  const rnsSubPage = useRnsSubPage();
  if (rnsSubPage) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-6 pb-[calc(89px+env(safe-area-inset-bottom,0px))] max-sm:px-[13px] sm:pb-6 md:mx-auto md:w-4/5">
          <RnsSubPage />
        </div>
      </div>
    );
  }

  // Connected view (existing wallet interface)
  const loggedInView = (
    <div className="h-full overflow-y-auto">
      <div className="p-6 md:w-4/5 md:mx-auto">
        <div className="space-y-6">
          <ProfileSection
            loading={!wallet.address}
            address={wallet.address}
            walletStats={walletStats}
            onProfileOptionsClick={() => setShowProfileOptions(true)}
          />

          <Suspense>
            <WalletBalance loading={!wallet.address} />
          </Suspense>

          {/* D19: Stakes sits right under the summary, above the tabs. It is
              not rendered with the pools flag off (059 I01). */}
          {import.meta.env.VITE_SHOW_CREATOR_POOL === "true" && (
            <Suspense>
              <StakesCard />
            </Suspense>
          )}

          <Suspense>
            <ProfileTabs loading={!wallet.address} />
          </Suspense>

          {/* 060 I01: Get tREVO holds the referee card (only for creators who
              joined through a link) and the Invite card. The Testnet faucet
              card joins this section with row 053. */}
          <section aria-labelledby="get-trevo-title" className="space-y-[21px] font-prism">
            <h2
              id="get-trevo-title"
              className="flex items-center gap-2 text-prism-eyebrow text-prism-ink-2"
            >
              <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-value" />
              GET tREVO
            </h2>
            <Suspense>
              <RefereeCard />
            </Suspense>
            <Suspense>
              <InviteCard />
            </Suspense>
          </section>

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
