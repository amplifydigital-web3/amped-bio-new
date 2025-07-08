import { Layers } from "lucide-react";

interface AdminBlockStatsProps {
  totalBlocks: number;
  blocksCreatedToday: number;
}

export const AdminBlockStats = ({ totalBlocks, blocksCreatedToday }: AdminBlockStatsProps) => {
  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-700">Total Blocks</h2>
        <Layers className="h-6 w-6 text-purple-600" />
      </div>
      <div className="mt-4">
        <p className="text-3xl font-bold">{totalBlocks.toLocaleString()}</p>
        <p className="mt-2 text-sm text-gray-500">{blocksCreatedToday} created today</p>
      </div>
    </div>
  );
};
