import { Layers } from "lucide-react";
import { AdminPlaceholderContent } from "../../components/admin";
import { AdminQuickActions } from "../../components/admin";

export function AdminBlocks() {
  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="flex-1 overflow-auto space-y-6">
      <AdminQuickActions
        title="Block Management"
        description="Monitor and manage user blocks across the platform"
        onRefresh={handleRefresh}
      />

      <AdminPlaceholderContent
        icon={<Layers className="h-12 w-12 mx-auto mb-4 text-gray-400" />}
        title="Block Management Dashboard"
        description="Block management interface will be implemented here"
      />
    </div>
  );
}
