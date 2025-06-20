import { useState } from "react";
import { AdminThemeManager } from "../../components/admin/AdminThemeManager";
import { AdminQuickActions } from "../../components/admin/AdminQuickActions";

export function AdminThemes() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      window.location.reload();
    }, 500); // Small delay to show loading state
  };

  return (
    <div className="flex-1 overflow-auto space-y-6">
      <AdminQuickActions
        title="Theme Management"
        description="Create and manage themes and categories"
        onRefresh={handleRefresh}
        isLoading={isRefreshing}
      />
      
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <AdminThemeManager />
      </div>
    </div>
  );
}
