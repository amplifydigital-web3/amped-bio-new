import { Layers, TrendingUp, TrendingDown } from "lucide-react";

interface AdminBlockStatsProps {
  totalBlocks: number;
  blocksCreatedToday: number;
  blocksCreatedLastWeek?: number;
}

export const AdminBlockStats = ({
  totalBlocks,
  blocksCreatedToday,
  blocksCreatedLastWeek,
}: AdminBlockStatsProps) => {
  // Calculate percentage change for blocks created
  const blockGrowthPercentage =
    blocksCreatedLastWeek && blocksCreatedLastWeek > 0
      ? Math.round(((blocksCreatedToday - blocksCreatedLastWeek) / blocksCreatedLastWeek) * 100)
      : blocksCreatedToday > 0
        ? 100
        : 0;

  // Determine if growth is positive
  const isPositiveGrowth = blockGrowthPercentage >= 0;

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-700">Total Blocks</h2>
        <Layers className="h-6 w-6 text-purple-600" />
      </div>
      <div className="mt-4">
        <p className="text-3xl font-bold">{totalBlocks.toLocaleString()}</p>
        <div className="mt-2 space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Created today</span>
            <div className="flex items-center">
              <span className="text-sm font-medium">{blocksCreatedToday.toLocaleString()}</span>
              {blocksCreatedLastWeek !== undefined && (
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
                  {Math.abs(blockGrowthPercentage)}%
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
