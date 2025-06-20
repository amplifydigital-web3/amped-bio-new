interface AdminBlockDistributionProps {
  blockTypeDistribution: Record<string, number>;
  mostPopularBlockType: string | null;
  averageBlocksPerUser: number;
}

export const AdminBlockDistribution = ({
  blockTypeDistribution,
  mostPopularBlockType,
  averageBlocksPerUser,
}: AdminBlockDistributionProps) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="py-4 px-6 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Block Performance</h2>
      </div>
      <div className="p-6">
        <div className="flex justify-between mb-6">
          <div>
            <p className="text-sm text-gray-500">Most Popular</p>
            <p className="text-xl font-bold">
              {mostPopularBlockType || "Unknown"} Blocks
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Avg. per User</p>
            <p className="text-xl font-bold">{averageBlocksPerUser}</p>
          </div>
        </div>

        {/* Block type distribution */}
        <h3 className="text-sm font-medium text-gray-700 mb-4">Block Type Distribution</h3>
        {Object.entries(blockTypeDistribution).map(([type, percentage], index) => (
          <div key={index} className="mb-3">
            <div className="flex justify-between mb-1">
              <span className="text-sm text-gray-600">{type}</span>
              <span className="text-sm font-medium">{percentage}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-purple-600 h-2 rounded-full"
                style={{ width: `${percentage}%` }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
