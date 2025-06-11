import { AdminThemeManager } from "../../components/admin/AdminThemeManager";
import { AdminQuickActions } from "../../components/admin/AdminQuickActions";

export function AdminThemes() {
  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="flex-1 overflow-auto space-y-6">
      <AdminQuickActions
        title="Theme Management"
        description="Create and manage themes and categories"
        onRefresh={handleRefresh}
      />
      
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <AdminThemeManager />
      </div>
    </div>
  );
}
