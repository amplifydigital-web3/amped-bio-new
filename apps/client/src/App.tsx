import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { Editor } from "./pages/Editor";

import { ProtectedRoute } from "./components/ProtectedRoute";
import { initParticlesEngine } from "@tsparticles/react";
import { loadAll } from "@tsparticles/all";
import { Toaster } from "react-hot-toast";
import { EditorProvider } from "./contexts/EditorContext";
import { useTokenExpiration } from "./hooks/useTokenExpiration";
import { useReferralHandler } from "./hooks/useReferralHandler";
import { useAuth } from "./contexts/AuthContext";
import { Loader2 } from "lucide-react";

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
const AdminNdauConversions = lazy(() =>
  import("./pages/admin/AdminNdauConversions").then(module => ({
    default: module.AdminNdauConversions,
  }))
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

      {/* Admin Routes with nested routing - lazy loaded with Suspense */}
      <Route
        path="/i/admin"
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
        <Route
          path="ndau-conversions"
          element={
            <Suspense fallback={<div>Loading conversions...</div>}>
              <AdminNdauConversions />
            </Suspense>
          }
        />
      </Route>

      {/* All public pages live on the public site. Send unauthenticated users
          there with the login popup open; redirect everything else to the site. */}
      <Route path="*" element={<PublicSiteRedirect />} />
    </Routes>
  );
}

// Redirects to the public site, opening the login popup for unauthenticated users
function PublicSiteRedirect() {
  const { authUser, isPending } = useAuth();

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <Navigate
      to={authUser === null ? `${import.meta.env.VITE_LANDING_URL}/login` : import.meta.env.VITE_LANDING_URL}
      replace
    />
  );
}

function App() {
  useReferralHandler();

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
