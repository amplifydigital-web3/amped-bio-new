import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  Users,
  Layers,
  Settings,
  LogOut,
  Home,
  ArrowUpRight,
  CheckCircle2,
  ShieldAlert,
  Hexagon,
  Wallet,
  Award,
  Eye,
  EyeOff,
} from "lucide-react";
import { trpc } from "../utils/trpc";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/authStore"; // Import the auth store

// Admin dashboard using TRPC for data
export function Admin() {
  const [activeMenu, setActiveMenu] = useState("dashboard");
  const [blockTypeDistribution, setBlockTypeDistribution] = useState<Record<string, number>>({});
  const [showEmails, setShowEmails] = useState(false);
  const navigate = useNavigate();
  const { signOut } = useAuthStore(); // Get the signOut method from auth store

  // Fetch data using TanStack Query with TRPC - using direct query method
  const { data: dashboardStats, isLoading: isDashboardLoading } = useQuery(
    trpc.admin.getDashboardStats.queryOptions()
  );

  const { data: topOnelinksData, isLoading: isTopOnelinksLoading } = useQuery(
    trpc.admin.getTopOnelinks.queryOptions({ limit: 5 })
  );

  const { data: usersData, isLoading: isUsersLoading } = useQuery(
    trpc.admin.getUsers.queryOptions({ page: 1, limit: 5 })
  );

  const { data: blockStatsData, isLoading: isBlockStatsLoading } = useQuery(
    trpc.admin.getBlockStats.queryOptions({})
  );

  // Process the block type distribution data whenever blockStatsData changes
  const { blocksByType, totalBlocks } = blockStatsData || {};

  // Calculate block type distribution when data is available
  if (blocksByType && totalBlocks && Object.keys(blockTypeDistribution).length === 0) {
    const blocksByTypeObj: Record<string, number> = {};

    (blocksByType as { type: string; count: number }[]).forEach(item => {
      const percentage = Math.round((item.count / totalBlocks) * 100);
      blocksByTypeObj[item.type] = percentage;
    });

    setBlockTypeDistribution(blocksByTypeObj);
  }

  // Direct access to the data returned from the server
  const userStats = dashboardStats?.userStats || null;
  const blockStats = dashboardStats?.blockStats || null;

  // Get recent users and top onelinks from query results
  const recentUsers = usersData?.users || [];
  const topOnelinks = topOnelinksData || [];

  // Determine if any data is still loading
  const loading =
    isDashboardLoading || isTopOnelinksLoading || isUsersLoading || isBlockStatsLoading;

  // Handle user role display
  const getUserRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-purple-100 text-purple-800 border border-purple-200";
      case "premium":
        return "bg-blue-100 text-blue-800 border border-blue-200";
      default:
        return "bg-gray-100 text-gray-800 border border-gray-200";
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Obscure email function
  const obscureEmail = (email: string) => {
    const [username, domain] = email.split("@");
    const obscuredUsername =
      username.charAt(0) +
      "•".repeat(Math.min(username.length - 1, 5)) +
      (username.length > 6 ? username.charAt(username.length - 1) : "");
    return `${obscuredUsername}@${domain}`;
  };

  // Handle onelink click
  const openOnelink = (onelink: string | null) => {
    if (onelink) {
      window.open(`/@${onelink}`, "_blank");
    }
  };

  // Copy email to clipboard
  const copyEmailToClipboard = (email: string, event: React.MouseEvent) => {
    event.stopPropagation();
    navigator.clipboard.writeText(email)
      .then(() => {
        toast.success("Email copied to clipboard", {
          duration: 2000,
          position: "bottom-right",
          style: {
            background: "#333",
            color: "#fff",
          },
          icon: "📋",
        });
      })
      .catch(err => {
        console.error('Could not copy email: ', err);
        toast.error("Failed to copy email");
      });
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await signOut(); // Call the signOut method from auth store
      navigate("/"); // After successful logout, navigate to home page
    } catch (error) {
      console.error("Logout failed:", error);
      toast.error("Failed to logout");
    }
  };

  // Sidebar navigation items - only showing available menus
  const sidebarItems = [
    { id: "dashboard", icon: BarChart3, label: "Dashboard" },
    { id: "users", icon: Users, label: "Users" },
    { id: "blocks", icon: Layers, label: "Blocks" },
    { id: "settings", icon: Settings, label: "Settings" },
  ];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-lg font-medium text-gray-700">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  if (!userStats || !blockStats) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <ShieldAlert className="h-12 w-12 mx-auto mb-4 text-red-500" />
          <p className="text-lg font-medium text-gray-700">Failed to load admin data</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
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
            onClick={handleLogout} // Changed to use the handleLogout function
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
          </div>

          <div className="flex items-center">
            {/* Admin User - simplified without dropdown and removed search/notifications */}
            <div className="flex items-center space-x-2">
              <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-medium">
                A
              </div>
              <span className="font-medium">Admin</span>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        {activeMenu === "dashboard" && (
          <div className="flex-1 overflow-auto p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Users Stats */}
              <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-700">Total Users</h2>
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
                <div className="mt-4">
                  <p className="text-3xl font-bold">{userStats.totalUsers.toLocaleString()}</p>
                  <div className="mt-2">
                    <span className="text-sm text-gray-500">
                      {userStats.newThisWeek} new this week
                    </span>
                  </div>
                </div>
              </div>

              {/* Blocks Stats */}
              <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-700">Total Blocks</h2>
                  <Layers className="h-6 w-6 text-purple-600" />
                </div>
                <div className="mt-4">
                  <p className="text-3xl font-bold">{blockStats.totalBlocks.toLocaleString()}</p>
                  <p className="mt-2 text-sm text-gray-500">
                    {blockStats.blocksCreatedToday} created today
                  </p>
                </div>
              </div>

              {/* Reward Program Stats */}
              <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-700">Reward Program</h2>
                  <Award className="h-6 w-6 text-amber-600" />
                </div>
                <div className="mt-4">
                  <p className="text-3xl font-bold">
                    {userStats.rewardProgramUsers.toLocaleString()}
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    {userStats.rewardProgramPercentage}% of users
                  </p>
                </div>
              </div>
            </div>

            {/* Block Distribution */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <div className="py-4 px-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Block Performance</h2>
              </div>
              <div className="p-6">
                <div className="flex justify-between mb-6">
                  <div>
                    <p className="text-sm text-gray-500">Most Popular</p>
                    <p className="text-xl font-bold">
                      {blockStats.mostPopularBlockType || "Unknown"} Blocks
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Avg. per User</p>
                    <p className="text-xl font-bold">{blockStats.averageBlocksPerUser}</p>
                  </div>
                </div>

                {/* Block type distribution */}
                <h3 className="text-sm font-medium text-gray-700 mb-4">Block Type Distribution</h3>
                {Object.entries(blockTypeDistribution).map(([type, percentage], index) => (
                  <div key={index} className="mb-3">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm text-gray-600">{type}</span>
                      <span className="text-sm font-medium">{percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-purple-600 h-2 rounded-full"
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Performing Onelinks */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <div className="py-4 px-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Top Performing Onelinks</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Onelink
                      </th>
                      <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Clicks
                      </th>
                      <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Block Count
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {topOnelinks.map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="py-4 px-6">
                          <div className="flex items-center">
                            <div className="h-10 w-10 flex-shrink-0 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="font-medium text-blue-600">@</span>
                            </div>
                            <div className="ml-4">
                              <div
                                className="text-sm font-medium text-gray-900 hover:text-blue-600 cursor-pointer flex items-center"
                                onClick={() => openOnelink(item.onelink)}
                              >
                                @{item.onelink || "unnamed"}
                                <ArrowUpRight className="h-3 w-3 ml-1" />
                              </div>
                              <div className="text-xs text-gray-500">{item.name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-sm text-gray-500">
                          {item.totalClicks.toLocaleString()}
                        </td>
                        <td className="py-4 px-6 text-sm">
                          <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                            {item.blockCount} blocks
                          </span>
                        </td>
                      </tr>
                    ))}
                    {topOnelinks.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-gray-500">
                          No data available
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Users */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <div className="py-4 px-6 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">Recent Users</h2>
                <button
                  onClick={() => setShowEmails(!showEmails)}
                  className="flex items-center text-sm text-blue-600 hover:text-blue-800"
                >
                  {showEmails ? (
                    <>
                      <EyeOff className="h-4 w-4 mr-1" />
                      <span>Hide Emails</span>
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4 mr-1" />
                      <span>Show Emails</span>
                    </>
                  )}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Onelink
                      </th>
                      <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Joined
                      </th>
                      <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Blocks
                      </th>
                      <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {recentUsers.map(user => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="py-4 px-6">
                          <div className="flex items-center">
                            <div className="h-10 w-10 flex-shrink-0 rounded-full bg-gray-200 flex items-center justify-center">
                              <span className="font-medium text-gray-600">
                                {user.name.charAt(0)}
                              </span>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">{user.name}</div>
                              <div 
                                className="text-sm text-gray-500 hover:text-blue-600 cursor-pointer"
                                onClick={(e) => copyEmailToClipboard(user.email, e)}
                                title="Click to copy email"
                              >
                                {showEmails ? user.email : obscureEmail(user.email)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-sm">
                          {user.onelink ? (
                            <span
                              className="text-blue-600 hover:text-blue-800 cursor-pointer flex items-center"
                              onClick={() => openOnelink(user.onelink)}
                            >
                              @{user.onelink}
                              <ArrowUpRight className="h-3 w-3 ml-1" />
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="py-4 px-6 text-sm text-gray-500">
                          {formatDate(user.created_at)}
                        </td>
                        <td className="py-4 px-6 text-sm text-gray-500">{user._count.blocks}</td>
                        <td className="py-4 px-6">
                          <span
                            className={`px-3 py-1 rounded-full text-xs ${getUserRoleBadge(user.role)}`}
                          >
                            {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {recentUsers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-gray-500">
                          No users found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="py-3 px-6 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
                <p className="text-sm text-gray-500">
                  Showing {recentUsers.length} of {userStats.totalUsers} users
                </p>
                <button
                  onClick={() => setActiveMenu("users")}
                  className="text-sm text-blue-600 font-medium hover:text-blue-800"
                >
                  View All Users
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Users Content (placeholder) */}
        {activeMenu === "users" && (
          <div className="flex-1 overflow-auto p-6">
            <div className="bg-white p-12 rounded-lg border border-gray-200 shadow-sm flex items-center justify-center">
              <div className="text-center">
                <Users className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <h2 className="text-xl font-semibold text-gray-700 mb-2">
                  User Management Dashboard
                </h2>
                <p className="text-gray-500 mb-6">
                  Complete user management interface will be implemented here
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Blocks Content (placeholder) */}
        {activeMenu === "blocks" && (
          <div className="flex-1 overflow-auto p-6">
            <div className="bg-white p-12 rounded-lg border border-gray-200 shadow-sm flex items-center justify-center">
              <div className="text-center">
                <Layers className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <h2 className="text-xl font-semibold text-gray-700 mb-2">
                  Block Management Dashboard
                </h2>
                <p className="text-gray-500 mb-6">
                  Block management interface will be implemented here
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Settings Content (placeholder) */}
        {activeMenu === "settings" && (
          <div className="flex-1 overflow-auto p-6">
            <div className="bg-white p-12 rounded-lg border border-gray-200 shadow-sm flex items-center justify-center">
              <div className="text-center">
                <Settings className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <h2 className="text-xl font-semibold text-gray-700 mb-2">Admin Settings</h2>
                <p className="text-gray-500 mb-6">Settings panel will be implemented here</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
