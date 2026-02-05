import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { Gift, Copy, AlertTriangle, RefreshCw } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { truncateAddress } from "../../../utils/blockchain";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "../../../utils/trpc";
import { trpcClient } from "../../../utils/trpc/trpc";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function AdminAffiliateRewards() {
  const [copied, setCopied] = useState(false);
  const [referrerRewardInput, setReferrerRewardInput] = useState("");
  const [refereeRewardInput, setRefereeRewardInput] = useState("");
  const queryClient = useQueryClient();

  const {
    data: walletInfoData,
    isLoading,
    isError,
    refetch,
  } = useQuery(trpc.admin.affiliate.getAffiliateWalletInfo.queryOptions());

  const { data: settingsData, isLoading: isSettingsLoading } = useQuery(
    trpc.admin.settings.getAffiliateRewardsStatus.queryOptions()
  );

  const { data: statsData } = useQuery(
    trpc.admin.affiliate.getAffiliateStats.queryOptions()
  );

  const setReferrerReward = useMutation({
    mutationFn: async (amount: string) => {
      return trpcClient.admin.settings.setAffiliateReferrerReward.mutate({ amount });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.admin.settings.getAffiliateRewardsStatus.queryOptions().queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: trpc.admin.affiliate.getAffiliateWalletInfo.queryOptions().queryKey,
      });
    },
  });

  const setRefereeReward = useMutation({
    mutationFn: async (amount: string) => {
      return trpcClient.admin.settings.setAffiliateRefereeReward.mutate({ amount });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.admin.settings.getAffiliateRewardsStatus.queryOptions().queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: trpc.admin.affiliate.getAffiliateWalletInfo.queryOptions().queryKey,
      });
    },
  });

  const handleReferrerRewardSave = () => {
    if (referrerRewardInput && /^\d*\.?\d+$/.test(referrerRewardInput)) {
      setReferrerReward.mutate(referrerRewardInput);
      setReferrerRewardInput("");
    }
  };

  const handleRefereeRewardSave = () => {
    if (refereeRewardInput && /^\d*\.?\d+$/.test(refereeRewardInput)) {
      setRefereeReward.mutate(refereeRewardInput);
      setRefereeRewardInput("");
    }
  };

  const walletInfo =
    walletInfoData && "success" in walletInfoData && walletInfoData.success === true
      ? walletInfoData
      : null;

  const error =
    walletInfoData && "success" in walletInfoData && walletInfoData.success === false
      ? (walletInfoData as any).error
      : null;

  const settings = settingsData || {
    referrerReward: null,
    refereeReward: null,
  };

  const stats = statsData || {
    totalReferrals: 0,
    rewardedReferrals: 0,
    pendingReferrals: 0,
    recentReferrals: [],
  };

  const handleCopyAddress = () => {
    if (!(walletInfo as any)?.address) return;
    navigator.clipboard.writeText((walletInfo as any).address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Gift className="h-4 w-4" /> Affiliate Rewards
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-24">
            <p className="text-sm text-gray-500">Loading affiliate information...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || error) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Gift className="h-4 w-4" /> Affiliate Rewards
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            <p className="text-sm">Error loading affiliate information</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!walletInfo) {
    return null;
  }

  const isConfigured = settings.referrerReward !== null && settings.refereeReward !== null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Gift className="h-4 w-4" /> Affiliate Rewards
            {!isConfigured && (
              <Tooltip
                content={
                  <p className="text-xs max-w-xs">
                    Rewards are not configured. Set reward amounts to enable automatic payouts.
                  </p>
                }
              >
                <span className="bg-gray-100 text-gray-800 text-xs font-medium px-2 py-0.5 rounded">
                  Not Configured
                </span>
              </Tooltip>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Wallet Address */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-gray-500">Wallet Address</p>
            <button
              onClick={handleCopyAddress}
              className="text-xs flex items-center gap-0.5 text-gray-500 hover:text-gray-700"
            >
              {copied ? "Copied!" : "Copy"} <Copy className="h-3 w-3 ml-0.5" />
            </button>
          </div>
          <p className="text-sm font-mono bg-gray-50 p-2 rounded-md overflow-auto whitespace-nowrap">
            {truncateAddress((walletInfo as any).address, 12, 8)}
          </p>
        </div>

        {/* Balance and Remaining Referrals */}
        {(walletInfo as any).balances.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">Wallet Balance</p>
            {(walletInfo as any).balances.map((chainBalance: any) => (
              <div key={chainBalance.chainId} className="space-y-1">
                <p className="text-sm">
                  <span className="font-semibold">
                    {(Number(chainBalance.formattedBalance) / 1e18).toFixed(4)}
                  </span>{" "}
                  {chainBalance.currency}
                </p>
                <p className="text-xs text-gray-600">
                  {isConfigured
                    ? `~${chainBalance.remainingReferrals} referrals remaining`
                    : "Configure rewards to estimate"}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Reward Configuration */}
        <div className="space-y-2">
          <p className="text-xs text-gray-500">Reward Configuration</p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-600">Referrer Reward</label>
              <div className="flex gap-1">
                <Input
                  type="text"
                  placeholder={settings.referrerReward || "0.01"}
                  value={referrerRewardInput}
                  onChange={e => setReferrerRewardInput(e.target.value)}
                  className="h-8 text-sm"
                  disabled={setReferrerReward.isPending}
                />
                <Button
                  size="sm"
                  onClick={handleReferrerRewardSave}
                  disabled={!referrerRewardInput || setReferrerReward.isPending}
                  className="h-8"
                >
                  Save
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Current: {settings.referrerReward || "Not set"}
              </p>
            </div>

            <div>
              <label className="text-xs text-gray-600">Referee Reward</label>
              <div className="flex gap-1">
                <Input
                  type="text"
                  placeholder={settings.refereeReward || "0.005"}
                  value={refereeRewardInput}
                  onChange={e => setRefereeRewardInput(e.target.value)}
                  className="h-8 text-sm"
                  disabled={setRefereeReward.isPending}
                />
                <Button
                  size="sm"
                  onClick={handleRefereeRewardSave}
                  disabled={!refereeRewardInput || setRefereeReward.isPending}
                  className="h-8"
                >
                  Save
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Current: {settings.refereeReward || "Not set"}
              </p>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="pt-2 border-t space-y-1">
          <p className="text-xs text-gray-500">Statistics</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-semibold">{stats.totalReferrals}</p>
              <p className="text-xs text-gray-500">Total Referrals</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-green-600">{stats.rewardedReferrals}</p>
              <p className="text-xs text-gray-500">Rewarded</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-amber-600">{stats.pendingReferrals}</p>
              <p className="text-xs text-gray-500">Pending</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
