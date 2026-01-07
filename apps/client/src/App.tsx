import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router";
import { Editor } from "./pages/Editor";
import { View } from "./pages/View";
import PoolsPage from "./pages/PoolsPage";
import { PoolDetailsPage } from "./pages/PoolDetailsPage";
import PublicLayout from "./components/layout/PublicLayout";

import { ProtectedRoute } from "./components/ProtectedRoute";
import { initParticlesEngine } from "@tsparticles/react";
import { loadAll } from "@tsparticles/all";
import { EmailVerification, EmailVerificationResent, PasswordReset } from "./pages/auth";
import { Toaster } from "react-hot-toast";
import { EditorProvider } from "./contexts/EditorContext";
import { useTokenExpiration } from "./hooks/useTokenExpiration";

// Lazy load admin components - they will only be loaded when needed
const AdminLayout = lazy(() =>
  import("./pages/admin/AdminLayout").then(module => ({ default: module.AdminLayout }))
);
const AdminDashboard = lazy(() =>
  import("./pages/admin/AdminDashboard").then(module => ({ default: module.AdminDashboard }))
);
const AdminUsers = lazy(() =>
  import("./pages/admin/AdminUsers").then(module => ({ default: module.AdminUsers }))
);
const AdminThemes = lazy(() =>
  import("./pages/admin/AdminThemes").then(module => ({ default: module.AdminThemes }))
);
const AdminBlocks = lazy(() =>
  import("./pages/admin/AdminBlocks").then(module => ({ default: module.AdminBlocks }))
);
const AdminFiles = lazy(() =>
  import("./pages/admin/AdminFiles").then(module => ({ default: module.AdminFiles }))
);
const AdminPools = lazy(() =>
  import("./pages/admin/AdminPools").then(module => ({ default: module.AdminPools }))
);

function AppRouter() {
  // Use the token expiration hook inside the router context
  useTokenExpiration();

  return (
    <Routes>
      <Route
        path="/:handle/edit"
        element={
          <ProtectedRoute>
            <Editor />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <PublicLayout>
            <View />
          </PublicLayout>
        }
      />
      <Route
        path="/:handle"
        element={
          <PublicLayout>
            <View />
          </PublicLayout>
        }
      />
      <Route
        path="/register"
        element={
          <PublicLayout>
            <View />
          </PublicLayout>
        }
      />
      <Route
        path="/login"
        element={
          <PublicLayout>
            <View />
          </PublicLayout>
        }
      />
      <Route
        path="/i/pools"
        element={
          <PublicLayout>
            <PoolsPage />
          </PublicLayout>
        }
      />
      <Route
        path="/i/pools/:address"
        element={
          <PublicLayout>
            <PoolDetailsPage />
          </PublicLayout>
        }
      />

      {/* Admin Routes with nested routing - lazy loaded with Suspense */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute adminOnly>
            <Suspense fallback={<div>Loading admin...</div>}>
              <AdminLayout />
            </Suspense>
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={
            <Suspense fallback={<div>Loading dashboard...</div>}>
              <AdminDashboard />
            </Suspense>
          }
        />
        <Route
          path="users"
          element={
            <Suspense fallback={<div>Loading users...</div>}>
              <AdminUsers />
            </Suspense>
          }
        />
        <Route
          path="themes"
          element={
            <Suspense fallback={<div>Loading themes...</div>}>
              <AdminThemes />
            </Suspense>
          }
        />
        <Route
          path="blocks"
          element={
            <Suspense fallback={<div>Loading blocks...</div>}>
              <AdminBlocks />
            </Suspense>
          }
        />
        <Route
          path="files"
          element={
            <Suspense fallback={<div>Loading files...</div>}>
              <AdminFiles />
            </Suspense>
          }
        />
        <Route
          path="pools"
          element={
            <Suspense fallback={<div>Loading pools...</div>}>
              <AdminPools />
            </Suspense>
          }
        />
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
