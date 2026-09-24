import { ReactNode } from "react";
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
  // Uses window.location.href because Navigate with replace uses history.replaceState()
  // which cannot change domains (app.amped.bio -> landing page)
  if (authUser === null) {
    window.location.href = `${import.meta.env.VITE_LANDING_URL}/login`;
    return null;
  }

  // Only admins can access this app
  if (!authUser.role.includes("admin")) {
    window.location.href = import.meta.env.VITE_LANDING_URL;
    return null;
  }

  return <>{children}</>;
}
