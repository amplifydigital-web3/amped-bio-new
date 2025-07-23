import { useQuery } from "@tanstack/react-query";
import { trpc } from "../../utils/trpc";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AdminUserStats,
  AdminBlockStats,
  AdminRewardStats,
  AdminBlockDistribution,
  AdminTopOnelinks,
  AdminRecentUsers,
  AdminLoadingSpinner,
  AdminLoadingError,
  AdminFaucetWalletStats,
} from "../../components/admin";
import { AdminQuickActions } from "../../components/admin";

export function AdminDashboard() {
  const [blockTypeDistribution, setBlockTypeDistribution] = useState<Record<string, number>>({});
  const navigate = useNavigate();

  // Fetch data using TanStack Query with TRPC
  const { data: dashboardStats, isLoading: isDashboardLoading } = useQuery(
    trpc.admin.dashboard.getDashboardStats.queryOptions()
  );

  const { data: topOnelinksData, isLoading: isTopOnelinksLoading } = useQuery(
    trpc.admin.users.getTopOnelinks.queryOptions({ limit: 5 })
  );

  const { data: usersData, isLoading: isUsersLoading } = useQuery(
    trpc.admin.users.getUsers.queryOptions({ page: 1, limit: 5 })
  );

  const { data: blockStatsData, isLoading: isBlockStatsLoading } = useQuery(
    trpc.admin.blocks.getBlockStats.queryOptions({})
  );

  const { data: walletInfoData, isLoading: isWalletInfoLoading } = useQuery(
    trpc.admin.wallet.getFaucetWalletInfo.queryOptions()
  );

  // Process the block type distribution data whenever blockStatsData changes
  const { blocksByType, totalBlocks } = blockStatsData || {};

  // Calculate block type distribution when data is available
  if (blocksByType && totalBlocks && Object.keys(blockTypeDistribution).length === 0) {
    const blocksByTypeObj: Record<string, number> = {};

    (blocksByType as { type: string; count: number }[]).forEach(item => {
      const percentage = Math.round((item.count / totalBlocks) * 100);
      blocksByTypeObj[item.type] = percentage;
    });

    setBlockTypeDistribution(blocksByTypeObj);
  }

  // Direct access to the data returned from the server
  const userStats = dashboardStats?.userStats || null;
  const blockStats = dashboardStats?.blockStats || null;

  // Get recent users and top onelinks from query results
  const recentUsers = usersData?.users || [];
  const topOnelinks = topOnelinksData || [];

  // Determine if any data is still loading
  const loading =
    isDashboardLoading ||
    isTopOnelinksLoading ||
    isUsersLoading ||
    isBlockStatsLoading ||
    isWalletInfoLoading;

  // Handle refresh
  const handleRefresh = () => {
    window.location.reload();
  };

  // Handle retry on load failure
  const handleRetry = () => {
    window.location.reload();
  };

  if (loading) {
    return <AdminLoadingSpinner />;
  }

  if (!userStats || !blockStats) {
    return <AdminLoadingError onRetry={handleRetry} />;
  }

  return (
    <div className="flex-1 overflow-auto space-y-6">
      <AdminQuickActions
        title="Dashboard Overview"
        description="Monitor system performance and user activity"
        onRefresh={handleRefresh}
        isLoading={loading}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Users Stats */}
        <AdminUserStats totalUsers={userStats.totalUsers} newThisWeek={userStats.newThisWeek} />

        {/* Blocks Stats */}
        <AdminBlockStats
          totalBlocks={blockStats.totalBlocks}
          blocksCreatedToday={blockStats.blocksCreatedToday}
        />

        {/* Reward Program Stats */}
        <AdminRewardStats
          rewardProgramUsers={userStats.rewardProgramUsers}
          rewardProgramPercentage={userStats.rewardProgramPercentage}
        />

        {/* Faucet Wallet Stats */}
        <AdminFaucetWalletStats
          walletInfo={
            walletInfoData && "success" in walletInfoData && walletInfoData.success === true
              ? {
                  address: (walletInfoData as any).address,
                  formattedBalance: (
                    Number((walletInfoData as any).formattedBalance) / 1e18
                  ).toFixed(4),
                  remainingAirdrops: Math.floor(
                    Number((walletInfoData as any).formattedBalance) /
                      (Number((walletInfoData as any).faucetAmount) * 1e18)
                  ),
                  faucetAmount: Number((walletInfoData as any).faucetAmount),
                  currency: (walletInfoData as any).currency,
                  isMockMode: (walletInfoData as any).isMockMode,
                }
              : walletInfoData && "success" in walletInfoData && walletInfoData.success === false
                ? {
                    address: "",
                    formattedBalance: "0",
                    remainingAirdrops: 0,
                    faucetAmount: 0,
                    currency: "",
                    isMockMode: false,
                    error: (walletInfoData as any).error,
                  }
                : null
          }
        />
      </div>

      {/* Block Distribution */}
      <AdminBlockDistribution
        blockTypeDistribution={blockTypeDistribution}
        mostPopularBlockType={blockStats.mostPopularBlockType}
        averageBlocksPerUser={blockStats.averageBlocksPerUser}
      />

      {/* Top Performing Onelinks */}
      <AdminTopOnelinks topOnelinks={topOnelinks} />

      {/* Recent Users */}
      <AdminRecentUsers
        recentUsers={recentUsers}
        totalUsers={userStats.totalUsers}
        onViewAllUsersClick={() => navigate("/admin/users")}
      />
    </div>
  );
}
