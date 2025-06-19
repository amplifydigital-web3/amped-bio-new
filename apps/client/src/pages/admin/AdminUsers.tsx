import { UserManagement } from "../../components/admin/UserManagement";
import { AdminQuickActions } from "../../components/admin/AdminQuickActions";

export function AdminUsers() {
  const handleRefresh = () => {
    window.location.reload();
  };

  const handleExportUsers = () => {
    // TODO: Implement user export functionality
    console.log("Exporting users...");
  };

  const handleAddUser = () => {
    // TODO: Implement add user functionality
    console.log("Adding new user...");
  };

  return (
    <div className="flex-1 overflow-auto space-y-6">
      <AdminQuickActions
        title="User Management"
        description="Manage user accounts, roles, and permissions"
        onRefresh={handleRefresh}
        onExport={handleExportUsers}
        onAdd={handleAddUser}
        addButtonText="Add User"
      />
      
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <UserManagement />
      </div>
    </div>
  );
}
