import { Users } from "lucide-react";

interface AdminUserStatsProps {
  totalUsers: number;
  newThisWeek: number;
}

export const AdminUserStats = ({ totalUsers, newThisWeek }: AdminUserStatsProps) => {
  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-700">Total Users</h2>
        <Users className="h-6 w-6 text-blue-600" />
      </div>
      <div className="mt-4">
        <p className="text-3xl font-bold">{totalUsers.toLocaleString()}</p>
        <div className="mt-2">
          <span className="text-sm text-gray-500">{newThisWeek} new this week</span>
        </div>
      </div>
    </div>
  );
};
