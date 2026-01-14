import { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: ReactNode;
  redirectTo?: string;
  adminOnly?: boolean;
}

export function ProtectedRoute({
  children,
  redirectTo = "/",
  adminOnly = false,
}: ProtectedRouteProps) {
  const { isAuthenticated, authUser } = useAuth();
  console.info("ProtectedRoute: Checking authentication and authorization", authUser);

  // Show loading while checking authentication status
  if (isAuthenticated === null) {
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

  // Redirect if not authenticated
  if (isAuthenticated === false) {
    return <Navigate to={redirectTo} replace />;
  }

  // Check admin access if required
  if (adminOnly && (!authUser || !authUser.role?.includes("admin"))) {
    return <Navigate to="/" replace />;
  }

  // User is authenticated, render children
  return <>{children}</>;
}
