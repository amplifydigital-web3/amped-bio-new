import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Hook to handle token expiration events
 * Listens for the custom 'auth:token-expired' event and redirects to login
 */
export function useTokenExpiration() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleTokenExpired = () => {
      console.log("Token expired, redirecting to login");

      // Clear any stored auth data
      localStorage.removeItem("amped-bio-auth-token");

      // You can also dispatch any global state updates here
      // For example, if you're using a global auth context or state management

      // Redirect to login page
      navigate("/login", { replace: true });
    };

    // Listen for the token expiration event
    window.addEventListener("auth:token-expired", handleTokenExpired);

    // Cleanup listener on unmount
    return () => {
      window.removeEventListener("auth:token-expired", handleTokenExpired);
    };
  }, [navigate]);
}
