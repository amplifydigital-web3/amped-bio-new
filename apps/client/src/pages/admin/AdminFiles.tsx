import { FileManagement } from "../../components/admin";
import { AdminQuickActions } from "../../components/admin/AdminQuickActions";

export function AdminFiles() {
  const handleRefresh = () => {
    window.location.reload();
  };

  const handleExportFiles = () => {
    // TODO: Implement file export functionality
    console.log("Exporting files...");
  };

  const handleCleanupFiles = () => {
    // TODO: Implement file cleanup functionality
    console.log("Cleaning up files...");
  };

  return (
    <div className="flex-1 overflow-auto space-y-6">
      <AdminQuickActions
        title="File Management"
        description="Manage uploaded files, storage, and file permissions"
        onRefresh={handleRefresh}
        onExport={handleExportFiles}
        onAdd={handleCleanupFiles}
        addButtonText="Cleanup Files"
      />
      
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <FileManagement />
      </div>
    </div>
  );
}
