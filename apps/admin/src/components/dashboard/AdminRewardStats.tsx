import { Award } from "lucide-react";

interface AdminRewardStatsProps {
  rewardProgramUsers: number;
  rewardProgramPercentage: number;
}

export const AdminRewardStats = ({
  rewardProgramUsers,
  rewardProgramPercentage,
}: AdminRewardStatsProps) => {
  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-700">Reward Program</h2>
        <Award className="h-6 w-6 text-amber-600" />
      </div>
      <div className="mt-4">
        <p className="text-3xl font-bold">{rewardProgramUsers.toLocaleString()}</p>
        <p className="mt-2 text-sm text-gray-500">{rewardProgramPercentage}% of users</p>
      </div>
    </div>
  );
};
