import { ArrowUpRight } from "lucide-react";

interface AdminTopOnelinkItem {
  handle: string | null;
  name: string;
  totalClicks: number;
  blockCount: number;
}

interface AdminTopOnelinksProps {
  topOnelinks: AdminTopOnelinkItem[];
}

export const AdminTopOnelinks = ({ topOnelinks }: AdminTopOnelinksProps) => {
  // Handle handle click
  const openOnelink = (handle: string | null) => {
    if (handle) {
      window.open(`/@${handle}`, "_blank");
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="py-4 px-6 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Top Performing Onelinks</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Onelink
              </th>
              <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Clicks
              </th>
              <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Block Count
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {topOnelinks.map((item, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="py-4 px-6">
                  <div className="flex items-center">
                    <div className="h-10 w-10 flex-shrink-0 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="font-medium text-blue-600">@</span>
                    </div>
                    <div className="ml-4">
                      <div
                        className="text-sm font-medium text-gray-900 hover:text-blue-600 cursor-pointer flex items-center"
                        onClick={() => openOnelink(item.handle)}
                      >
                        @{item.handle || "unnamed"}
                        <ArrowUpRight className="h-3 w-3 ml-1" />
                      </div>
                      <div className="text-xs text-gray-500">{item.name}</div>
                    </div>
                  </div>
                </td>
                <td className="py-4 px-6 text-sm text-gray-500">
                  {item.totalClicks.toLocaleString()}
                </td>
                <td className="py-4 px-6 text-sm">
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                    {item.blockCount} blocks
                  </span>
                </td>
              </tr>
            ))}
            {topOnelinks.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-gray-500">
                  No data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
