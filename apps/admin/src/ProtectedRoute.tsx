import { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "@repo/ui";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isPending, authUser } = useAuth();

  // Show loading while checking authentication status
  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center p-8">
          <div className="relative">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-6" />
            <div className="absolute inset-0 h-12 w-12 rounded-full border-2 border-blue-200 border-t-transparent animate-pulse mx-auto"></div>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Loading...</h2>
          <p className="text-gray-600">Checking authentication status</p>
        </div>
      </div>
    );
  }

  // Redirect to the public site with the login popup open if not authenticated
  if (authUser === null) {
    return <Navigate to={`${import.meta.env.VITE_LANDING_URL}/login`} replace />;
  }

  // Only admins can access this app
  if (!authUser.role.includes("admin")) {
    return <Navigate to={import.meta.env.VITE_LANDING_URL} replace />;
  }

  return <>{children}</>;
}
