import { useCallback, PropsWithChildren } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { useAuth } from "@/contexts/AuthContext";

const PrivyAuthProvider: React.FC<PropsWithChildren> = ({ children }) => {
  // Get auth details from your provider
  const { getToken, isLoading, isAuthenticated } = useAuth();

  // Create a callback to get the token
  const getCustomToken = useCallback(
    async () => {
      // Your logic to retrieve the JWT token from your auth provider
      try {
        const token = await getToken();
        return token;
      } catch (error) {
        // If there's an error, the user is likely not authenticated
        return undefined;
      }
    },
    [isAuthenticated, getToken] // Re-create when auth state changes
  );

  return (
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      config={{
        customAuth: {
          // Indicates if your auth provider is currently updating auth state
          isLoading: isLoading,
          // Callback to get the user's JWT token
          getCustomAccessToken: getCustomToken,
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
};

export default PrivyAuthProvider;
