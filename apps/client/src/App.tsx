import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Editor } from "./pages/Editor";
import { View } from "./pages/View";
import { Account } from "./pages/Account";
import { AdminLayout } from "./pages/admin/AdminLayout";
import {
  AdminDashboard,
  AdminUsers,
  AdminThemes,
  AdminBlocks,
  AdminFiles,
  AdminSettings,
} from "./pages/admin";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { initParticlesEngine } from "@tsparticles/react";
//import { loadSlim } from '@tsparticles/slim';
import { loadAll } from "@tsparticles/all";
import { EmailVerification, EmailVerificationResent, PasswordReset } from "./pages/auth";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./utils/trpc";
import { Toaster } from "react-hot-toast";
import { Web3AuthProvider } from "@web3auth/modal/react";
import web3AuthContextConfig from "./utils/web3authContext";
import { AuthProvider } from "./contexts/AuthContext";
import { EditorProvider } from "./contexts/EditorContext";
import { useTokenExpiration } from "./hooks/useTokenExpiration";
import { WagmiProvider } from "@web3auth/modal/react/wagmi";
// import { wagmiConfig } from "./utils/wagmiConfig";

function AppRouter() {
  // Use the token expiration hook inside the router context
  useTokenExpiration();

  return (
    <Routes>
      <Route
        path="/:onelink/edit"
        element={
          <ProtectedRoute>
            <Editor />
          </ProtectedRoute>
        }
      />
      <Route path="/:onelink" element={<View />} />
      <Route path="/register" element={<View />} />
      <Route path="/" element={<View />} />

      {/* Admin Routes with nested routing */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute adminOnly>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="themes" element={<AdminThemes />} />
        <Route path="blocks" element={<AdminBlocks />} />
        <Route path="files" element={<AdminFiles />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      <Route
        path="/account"
        element={
          <ProtectedRoute>
            <Account />
          </ProtectedRoute>
        }
      />

      {/* Authentication Routes */}
      <Route path="/auth/verify-email/:token?" element={<EmailVerification />} />
      <Route path="/auth/resend-verification" element={<EmailVerificationResent />} />
      <Route path="/auth/reset-password/:token?" element={<PasswordReset />} />
    </Routes>
  );
}

function App() {
  const [init, setInit] = useState(false);

  // Add CSS variables for consistent styling across auth pages
  useEffect(() => {
    // Add primary colors to root CSS variables if they don't exist already
    const root = document.documentElement;
    if (!root.style.getPropertyValue("--color-primary")) {
      root.style.setProperty("--color-primary", "#3B82F6"); // Blue-500
      root.style.setProperty("--color-primary-dark", "#2563EB"); // Blue-600
    }
  }, []);

  // this should be run only once per application lifetime
  useEffect(() => {
    initParticlesEngine(async engine => {
      // you can initiate the tsParticles instance (engine) here, adding custom shapes or presets
      // this loads the tsparticles package bundle, it's the easiest method for getting everything ready
      // starting from v2 you can add only the features you need reducing the bundle size
      await loadAll(engine);
      //await loadFull(engine);
      // await loadSlim(engine);
      //await loadBasic(engine);
    }).then(() => {
      // setInit(true);
    });
  }, []);

  // if (init) {
  return (
    <Web3AuthProvider config={web3AuthContextConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider>
          <AuthProvider>
            <EditorProvider>
              <BrowserRouter>
                <AppRouter />
              </BrowserRouter>
            </EditorProvider>
          </AuthProvider>
        </WagmiProvider>
      </QueryClientProvider>
      <Toaster />
    </Web3AuthProvider>
  );
  // }
  // return <></>;
}

export default App;
