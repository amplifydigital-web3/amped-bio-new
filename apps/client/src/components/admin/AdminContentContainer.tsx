import { Layers, Settings } from "lucide-react";
import { AdminHeader, AdminPlaceholderContent } from "./AdminLayout";
import { AdminDashboard } from "./AdminDashboard";
import { UserManagement } from "./UserManagement";
import { AdminThemeManager } from "./AdminThemeManager";

interface AdminContentContainerProps {
  activeMenu: string;
  setActiveMenu: (menu: string) => void;
  dashboardData: {
    userStats: any;
    blockStats: any;
    blockTypeDistribution: Record<string, number>;
    topOnelinks: any[];
    recentUsers: any[];
  };
  loading: boolean;
}

export const AdminContentContainer = ({ 
  activeMenu, 
  setActiveMenu,
  dashboardData,
  loading
}: AdminContentContainerProps) => {
  const { userStats, blockStats, blockTypeDistribution, topOnelinks, recentUsers } = dashboardData;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-lg font-medium text-gray-700">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top Header */}
      <AdminHeader title={
        activeMenu === "dashboard" ? "Admin Dashboard" : 
        activeMenu === "users" ? "User Management" : 
        activeMenu === "blocks" ? "Block Management" : 
        activeMenu === "settings" ? "Admin Settings" : 
        "Admin Dashboard"
      } />

      {/* Content based on active menu */}
      {activeMenu === "dashboard" && (
        <AdminDashboard
          userStats={userStats}
          blockStats={blockStats}
          blockTypeDistribution={blockTypeDistribution}
          topOnelinks={topOnelinks}
          recentUsers={recentUsers}
          onViewAllUsersClick={() => setActiveMenu("users")}
        />
      )}

      {activeMenu === "users" && (
        <UserManagement />
      )}

      {activeMenu === "blocks" && (
        <AdminPlaceholderContent
          icon={<Layers className="h-12 w-12 mx-auto mb-4 text-gray-400" />}
          title="Block Management Dashboard"
          description="Block management interface will be implemented here"
        />
      )}

      {activeMenu === "settings" && (
        <AdminPlaceholderContent
          icon={<Settings className="h-12 w-12 mx-auto mb-4 text-gray-400" />}
          title="Admin Settings"
          description="Settings panel will be implemented here"
        />
      )}

      {activeMenu === "themes" && (
        <AdminThemeManager />
      )}
    </div>
  );
};
