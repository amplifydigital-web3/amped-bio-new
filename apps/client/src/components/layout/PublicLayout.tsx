import React, { useState } from "react";
import { Outlet, Link, useLocation, useParams } from "react-router";
import AMPLIFY_FULL_K from "@/assets/AMPLIFY_FULL_K.svg";
import { UserMenu } from "../auth/UserMenu";
import { normalizeHandle } from "@/utils/handle";

// Default handle username to show when accessing root URL
const DEFAULT_ONELINK = "landingpage";

interface PublicLayoutProps {
  children?: React.ReactNode;
}

const PublicLayout: React.FC<PublicLayoutProps> = ({ children }) => {
  const { handle = "" } = useParams();
  const location = useLocation();

  // Check if we're on the register route
  const isRegisterRoute = location.pathname === "/register";
  const isLoginRoute = location.pathname === "/login";

  const [loading, setLoading] = useState(isRegisterRoute || isLoginRoute ? false : true);

  // Use default handle when on root URL with no handle parameter
  const effectiveHandle =
    ["/", "/register", "/login"].includes(location.pathname) && (!handle || handle === "")
      ? DEFAULT_ONELINK
      : handle;

  // Normalize handle to handle @ symbols in URLs
  const normalizedHandle = normalizeHandle(effectiveHandle);

  // Determine if navbar should be shown (landingpage user, root route, or register route)
  const shouldShowNavbar =
    location.pathname.includes("/i/") ||
    normalizedHandle === DEFAULT_ONELINK ||
    location.pathname === "/" ||
    isRegisterRoute ||
    isLoginRoute;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar - visível nas rotas definidas */}
      {shouldShowNavbar && (
        <header className="sticky top-0 z-30 h-16 border-b bg-white px-6 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center space-x-6">
            <Link to="/" className="flex items-center">
              <img src={AMPLIFY_FULL_K} alt="Amplify Logo" className="h-8" />
            </Link>
            <Link to="/i/pools" className="text-sm font-medium text-gray-700 hover:text-gray-900">
              Pools
            </Link>
          </div>
          <UserMenu />
        </header>
      )}

      <main className="flex-grow">{children || <Outlet />}</main>
    </div>
  );
};

export default PublicLayout;
