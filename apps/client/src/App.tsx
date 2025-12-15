import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Editor } from "./pages/Editor";
import { View } from "./pages/View";
import PoolsPage from "./pages/PoolsPage";
import { PoolDetailsPage } from "./pages/PoolDetailsPage";
import PublicLayout from "./components/layout/PublicLayout";

import { AdminLayout } from "./pages/admin/AdminLayout";
import { AdminDashboard, AdminUsers, AdminThemes, AdminBlocks, AdminFiles, AdminPools } from "./pages/admin";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { initParticlesEngine } from "@tsparticles/react";
import { loadAll } from "@tsparticles/all";
import { EmailVerification, EmailVerificationResent, PasswordReset } from "./pages/auth";
import { Toaster } from "react-hot-toast";
import { EditorProvider } from "./contexts/EditorContext";
import { useTokenExpiration } from "./hooks/useTokenExpiration";

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
      <Route path="/" element={
        <PublicLayout>
          <View />
        </PublicLayout>
      } />
      <Route path="/:onelink" element={
        <PublicLayout>
          <View />
        </PublicLayout>
      } />
      <Route path="/register" element={
        <PublicLayout>
          <View />
        </PublicLayout>
      } />
      <Route path="/login" element={
        <PublicLayout>
          <View />
        </PublicLayout>
      } />
      <Route path="/i/pools" element={
        <PublicLayout>
          <PoolsPage />
        </PublicLayout>
      } />
      <Route path="/i/pools/:address" element={<PoolDetailsPage />} />

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
        <Route path="pools" element={<AdminPools />} />
      </Route>

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
    <BrowserRouter>
      <EditorProvider>
        <AppRouter />
        <Toaster />
      </EditorProvider>
    </BrowserRouter>
  );
}

export default App;
