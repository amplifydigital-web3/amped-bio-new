import { AdminUserStats } from "./AdminUserStats";
import { AdminBlockStats } from "./AdminBlockStats";
import { AdminRewardStats } from "./AdminRewardStats";
import { AdminBlockDistribution } from "./AdminBlockDistribution";
import { AdminTopOnelinks } from "./AdminTopOnelinks";
import { AdminRecentUsers } from "./AdminRecentUsers";

interface AdminDashboardProps {
  userStats: {
    totalUsers: number;
    newThisWeek: number;
    rewardProgramUsers: number;
    rewardProgramPercentage: number;
  };
  blockStats: {
    totalBlocks: number;
    blocksCreatedToday: number;
    mostPopularBlockType: string;
    averageBlocksPerUser: number;
  };
  blockTypeDistribution: Record<string, number>;
  topOnelinks: Array<{
    onelink: string | null;
    name: string;
    totalClicks: number;
    blockCount: number;
  }>;
  recentUsers: Array<{
    id: string;
    name: string;
    email: string;
    onelink: string | null;
    created_at: string;
    role: string;
    _count: {
      blocks: number;
    };
  }>;
  onViewAllUsersClick: () => void;
}

export const AdminDashboard = ({
  userStats,
  blockStats,
  blockTypeDistribution,
  topOnelinks,
  recentUsers,
  onViewAllUsersClick,
}: AdminDashboardProps) => {
  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Users Stats */}
        <AdminUserStats 
          totalUsers={userStats.totalUsers} 
          newThisWeek={userStats.newThisWeek} 
        />

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
        onViewAllUsersClick={onViewAllUsersClick}
      />
    </div>
  );
};
