import { Settings } from "lucide-react";
import { AdminPlaceholderContent } from "../../components/admin";
import { AdminQuickActions } from "../../components/admin";

export function AdminSettings() {
  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="flex-1 overflow-auto space-y-6">
      <AdminQuickActions
        title="Admin Settings"
        description="Configure system settings and preferences"
        onRefresh={handleRefresh}
      />

      <AdminPlaceholderContent
        icon={<Settings className="h-12 w-12 mx-auto mb-4 text-gray-400" />}
        title="Admin Settings"
        description="Settings panel will be implemented here"
      />
    </div>
  );
}
