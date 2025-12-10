import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { BarChart3, Users, Layers, LogOut, Home, Hexagon, Files, CoinsIcon } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { AdminHeader } from "../../components/admin";
import { AdminBreadcrumb } from "../../components/admin";
import { AdminNotificationContainer } from "../../components/admin";
import { useAdminKeyboardShortcuts } from "../../hooks/useAdminKeyboardShortcuts";

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();

  // Enable keyboard shortcuts
  useAdminKeyboardShortcuts();

  // Sidebar navigation items with keyboard shortcuts
  const sidebarItems = [
    { id: "dashboard", icon: BarChart3, label: "Dashboard", path: "/admin", shortcut: "⌘⌥D" },
    { id: "users", icon: Users, label: "Users", path: "/admin/users", shortcut: "⌘⌥U" },
    { id: "blocks", icon: Layers, label: "Blocks", path: "/admin/blocks", shortcut: "⌘⌥B" },
    { id: "themes", icon: Hexagon, label: "Themes", path: "/admin/themes", shortcut: "⌘⌥T" },
    { id: "files", icon: Files, label: "Files", path: "/admin/files", shortcut: "⌘⌥F" },
    { id: "pools", icon: CoinsIcon, label: "Pools", path: "/admin/pools", shortcut: "⌘⌥P" },
  ];

  // Handle logout
  const handleLogout = async () => {
    try {
      await signOut();
      navigate("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  // Get current page title based on route
  const getCurrentPageTitle = () => {
    const currentPath = location.pathname;
    switch (currentPath) {
      case "/admin":
        return "Admin Dashboard";
      case "/admin/users":
        return "User Management";
      case "/admin/blocks":
        return "Block Management";
      case "/admin/themes":
        return "Theme Management";
      case "/admin/files":
        return "File Management";
      case "/admin/pools":
        return "Pool Management";
      default:
        return "Admin Dashboard";
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Notification Container */}
      <AdminNotificationContainer />

      {/* Admin Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <Hexagon className="h-6 w-6 text-blue-600" />
            <span className="text-xl font-bold">Amped Admin</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {sidebarItems.map(item => (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200 group ${
                location.pathname === item.path
                  ? "bg-blue-50 text-blue-600 shadow-sm"
                  : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              }`}
              title={`${item.label} (${item.shortcut})`}
            >
              <div className="flex items-center space-x-3">
                <item.icon className="h-5 w-5" />
                <span className="font-medium">{item.label}</span>
              </div>
              <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                {item.shortcut}
              </span>
            </button>
          ))}
        </nav>

        {/* User Menu */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-3 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            <span className="font-medium">Log out</span>
          </button>

          <button
            onClick={() => navigate("/")}
            className="mt-2 w-full flex items-center space-x-3 px-4 py-3 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Home className="h-5 w-5" />
            <span className="font-medium">Back to App</span>
          </button>

          {/* Keyboard Shortcuts Info */}
          <div className="mt-4 px-4 py-2 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 font-medium mb-1">Keyboard Shortcuts</p>
            <p className="text-xs text-gray-400">⌘⌥ + D/U/B/T/F</p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <AdminHeader title={getCurrentPageTitle()} />

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            <AdminBreadcrumb />
            <div className="min-h-full">
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
