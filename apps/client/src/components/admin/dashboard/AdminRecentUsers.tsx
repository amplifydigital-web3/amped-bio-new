import { ArrowUpRight, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { obscureEmail } from "../../../utils/email";

interface User {
  id: number;
  name: string;
  email: string;
  onelink: string | null;
  created_at: string;
  role: string;
  _count: {
    blocks: number;
  };
}

interface AdminRecentUsersProps {
  recentUsers: User[];
  totalUsers: number;
  onViewAllUsersClick: () => void;
}

export const AdminRecentUsers = ({
  recentUsers,
  totalUsers,
  onViewAllUsersClick,
}: AdminRecentUsersProps) => {
  const [showEmails, setShowEmails] = useState(false);

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

  // Email obscuring functionality moved to utils/email.ts

  // Handle onelink click
  const openOnelink = (onelink: string | null) => {
    if (onelink) {
      window.open(`/@${onelink}`, "_blank");
    }
  };

  // Copy email to clipboard
  const copyEmailToClipboard = (email: string, event: React.MouseEvent) => {
    event.stopPropagation();
    navigator.clipboard
      .writeText(email)
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
        console.error("Could not copy email: ", err);
        toast.error("Failed to copy email");
      });
  };

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

  return (
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
                      <span className="font-medium text-gray-600">{user.name.charAt(0)}</span>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{user.name}</div>
                      <div
                        className="text-sm text-gray-500 hover:text-blue-600 cursor-pointer"
                        onClick={e => copyEmailToClipboard(user.email, e)}
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
                <td className="py-4 px-6 text-sm text-gray-500">{formatDate(user.created_at)}</td>
                <td className="py-4 px-6 text-sm text-gray-500">{user._count.blocks}</td>
                <td className="py-4 px-6">
                  <span className={`px-3 py-1 rounded-full text-xs ${getUserRoleBadge(user.role)}`}>
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
          Showing {recentUsers.length} of {totalUsers} users
        </p>
        <button
          onClick={onViewAllUsersClick}
          className="text-sm text-blue-600 font-medium hover:text-blue-800"
        >
          View All Users
        </button>
      </div>
    </div>
  );
};
