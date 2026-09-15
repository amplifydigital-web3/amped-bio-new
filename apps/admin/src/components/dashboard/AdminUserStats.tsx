import { Users, TrendingUp, TrendingDown } from "lucide-react";

interface AdminUserStatsProps {
  totalUsers: number;
  newThisWeek: number;
  usersLastWeek?: number;
  activeUsers?: number;
}

export const AdminUserStats = ({
  totalUsers,
  newThisWeek,
  usersLastWeek,
  activeUsers,
}: AdminUserStatsProps) => {
  // Calculate percentage change for new users this week
  const userGrowthPercentage =
    usersLastWeek && usersLastWeek > 0
      ? Math.round(((newThisWeek - usersLastWeek) / usersLastWeek) * 100)
      : newThisWeek > 0
        ? 100
        : 0;

  // Determine if growth is positive
  const isPositiveGrowth = userGrowthPercentage >= 0;

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-700">Total Users</h2>
        <Users className="h-6 w-6 text-blue-600" />
      </div>
      <div className="mt-4">
        <p className="text-3xl font-bold">{totalUsers.toLocaleString()}</p>
        <div className="mt-2 space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">New this week</span>
            <div className="flex items-center">
              <span className="text-sm font-medium">{newThisWeek.toLocaleString()}</span>
              {usersLastWeek !== undefined && (
                <span
                  className={`ml-2 text-xs font-medium flex items-center ${
                    isPositiveGrowth ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {isPositiveGrowth ? (
                    <TrendingUp className="h-3 w-3 mr-1" />
                  ) : (
                    <TrendingDown className="h-3 w-3 mr-1" />
                  )}
                  {Math.abs(userGrowthPercentage)}%
                </span>
              )}
            </div>
          </div>
          {activeUsers !== undefined && (
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Active users</span>
              <span className="text-sm font-medium">{activeUsers.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
