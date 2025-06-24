import { FileManagement } from "../../components/admin";
import { AdminQuickActions } from "../../components/admin";

export function AdminFiles() {
  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="flex-1 overflow-auto space-y-6">
      <AdminQuickActions
        title="File Management"
        description="Manage uploaded files, storage, and file permissions"
        onRefresh={handleRefresh}
      />
      
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <FileManagement />
      </div>
    </div>
  );
}
