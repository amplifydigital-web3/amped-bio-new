import React from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import AMPLIFY_FULL_K from "@/assets/AMPLIFY_FULL_K.svg";
import { UserMenu } from "../auth/UserMenu";

interface PublicLayoutProps {
  children?: React.ReactNode;
}

const PublicLayout: React.FC<PublicLayoutProps> = ({ children }) => {
  const location = useLocation();
  const shouldShowNavbar = location.pathname === "/" ||
    location.pathname.startsWith("/@") ||
    location.pathname === "/register" ||
    location.pathname === "/login" ||
    location.pathname === "/i/pools";

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

      <main className="flex-grow">
        {children || <Outlet />}
      </main>
    </div>
  );
};

export default PublicLayout;