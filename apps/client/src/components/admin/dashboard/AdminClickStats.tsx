import { MousePointerClick } from "lucide-react";

interface AdminClickStatsProps {
  totalClicks: number;
  clicksThisWeek: number;
  clicksLastWeek: number;
  clicksThisMonth: number;
  clicksLastMonth: number;
}

export const AdminClickStats = ({
  totalClicks,
  clicksThisWeek,
  clicksLastWeek,
  clicksThisMonth,
  clicksLastMonth,
}: AdminClickStatsProps) => {
  // Calculate percentage changes
  const weeklyChange = clicksLastWeek > 0 
    ? Math.round(((clicksThisWeek - clicksLastWeek) / clicksLastWeek) * 100) 
    : clicksThisWeek > 0 ? 100 : 0;
  
  const monthlyChange = clicksLastMonth > 0 
    ? Math.round(((clicksThisMonth - clicksLastMonth) / clicksLastMonth) * 100) 
    : clicksThisMonth > 0 ? 100 : 0;

  // Helper function to determine if change is positive
  const isPositive = (change: number) => change >= 0;

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-700">Total Clicks</h2>
        <MousePointerClick className="h-6 w-6 text-blue-600" />
      </div>
      <div className="mt-4">
        <p className="text-3xl font-bold">{totalClicks.toLocaleString()}</p>
        
        <div className="mt-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">This week</span>
            <div className="flex items-center">
              <span className="text-sm font-medium">{clicksThisWeek.toLocaleString()}</span>
              <span className={`ml-2 text-xs font-medium flex items-center ${
                isPositive(weeklyChange) ? "text-green-600" : "text-red-600"
              }`}>
                {isPositive(weeklyChange) ? "↑" : "↓"} {Math.abs(weeklyChange)}%
              </span>
            </div>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Last week</span>
            <span className="text-sm font-medium">{clicksLastWeek.toLocaleString()}</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">This month</span>
            <div className="flex items-center">
              <span className="text-sm font-medium">{clicksThisMonth.toLocaleString()}</span>
              <span className={`ml-2 text-xs font-medium flex items-center ${
                isPositive(monthlyChange) ? "text-green-600" : "text-red-600"
              }`}>
                {isPositive(monthlyChange) ? "↑" : "↓"} {Math.abs(monthlyChange)}%
              </span>
            </div>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Last month</span>
            <span className="text-sm font-medium">{clicksLastMonth.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
};