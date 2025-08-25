import { UserManagement } from "../../components/admin";
import { AdminQuickActions } from "../../components/admin";

export function AdminUsers() {
  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="flex-1 overflow-auto space-y-6">
      <AdminQuickActions
        title="User Management"
        description="Manage user accounts, roles, and permissions"
        onRefresh={handleRefresh}
        // onAdd={handleAddUser}
        addButtonText="Add User"
      />

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <UserManagement />
      </div>
    </div>
  );
}
