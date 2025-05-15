import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../utils/trpc";
import { useQuery } from "@tanstack/react-query";
import {
  AdminSidebar,
  AdminContentContainer,
  AdminLoadingSpinner,
  AdminLoadingError
} from "../components/admin";

// Admin dashboard using TRPC for data
export function Admin() {
  const [activeMenu, setActiveMenu] = useState("dashboard");
  const [blockTypeDistribution, setBlockTypeDistribution] = useState<Record<string, number>>({});
  const navigate = useNavigate();

  // Fetch data using TanStack Query with TRPC
  const { data: dashboardStats, isLoading: isDashboardLoading } = useQuery(
    trpc.admin.getDashboardStats.queryOptions()
  );

  const { data: topOnelinksData, isLoading: isTopOnelinksLoading } = useQuery(
    trpc.admin.getTopOnelinks.queryOptions({ limit: 5 })
  );

  const { data: usersData, isLoading: isUsersLoading } = useQuery(
    trpc.admin.getUsers.queryOptions({ page: 1, limit: 5 })
  );

  const { data: blockStatsData, isLoading: isBlockStatsLoading } = useQuery(
    trpc.admin.getBlockStats.queryOptions({})
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
  const loading = isDashboardLoading || isTopOnelinksLoading || isUsersLoading || isBlockStatsLoading;

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

  // Prepare the data needed for the dashboard
  const dashboardData = {
    userStats,
    blockStats,
    blockTypeDistribution,
    topOnelinks,
    recentUsers
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Admin Sidebar */}
      <AdminSidebar activeMenu={activeMenu} setActiveMenu={setActiveMenu} />

      {/* Main Content Container */}
      <AdminContentContainer 
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        dashboardData={dashboardData}
        loading={false}
      />
    </div>
  );
}
