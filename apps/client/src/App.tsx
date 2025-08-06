import { useEffect } from "react";
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
import { loadAll } from "@tsparticles/all";
import { EmailVerification, EmailVerificationResent, PasswordReset } from "./pages/auth";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./contexts/AuthContext";
import { EditorProvider } from "./contexts/EditorContext";
import { useTokenExpiration } from "./hooks/useTokenExpiration";
import { WalletProvider } from "./contexts/WalletContext";

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
  useEffect(() => {
    initParticlesEngine(async engine => {
      await loadAll(engine);
    });
  }, []);

  return (
    <AuthProvider>
      <WalletProvider>
        <EditorProvider>
          <BrowserRouter>
            <AppRouter />
            <Toaster />
          </BrowserRouter>
        </EditorProvider>
      </WalletProvider>
    </AuthProvider>
  );
}

export default App;
