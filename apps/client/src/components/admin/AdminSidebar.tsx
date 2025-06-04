import { BarChart3, Users, Layers, Settings, LogOut, Home, Hexagon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";

interface AdminSidebarProps {
  activeMenu: string;
  setActiveMenu: (menu: string) => void;
}

export const AdminSidebar = ({ activeMenu, setActiveMenu }: AdminSidebarProps) => {
  const navigate = useNavigate();
  const { signOut } = useAuthStore();

  // Sidebar navigation items
  const sidebarItems = [
    { id: "dashboard", icon: BarChart3, label: "Dashboard" },
    { id: "users", icon: Users, label: "Users" },
    { id: "blocks", icon: Layers, label: "Blocks" },
    { id: "themes", icon: Hexagon, label: "Themes" }, // Added Themes section
    { id: "settings", icon: Settings, label: "Settings" },
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

  return (
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
            onClick={() => setActiveMenu(item.id)}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
              activeMenu === item.id
                ? "bg-blue-50 text-blue-600"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <item.icon className="h-5 w-5" />
            <span className="font-medium">{item.label}</span>
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
      </div>
    </div>
  );
};
