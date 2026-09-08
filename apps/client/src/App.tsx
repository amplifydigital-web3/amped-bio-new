import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { Editor } from "./pages/Editor";

import { ProtectedRoute } from "./components/ProtectedRoute";
import { initParticlesEngine } from "@tsparticles/react";
import { loadAll } from "@tsparticles/all";
import { Toaster } from "react-hot-toast";
import { Toaster as AppToaster } from "@/components/ui/toast";
import { EditorProvider } from "./contexts/EditorContext";
import { useTokenExpiration } from "./hooks/useTokenExpiration";
import { useReferralHandler } from "./hooks/useReferralHandler";
import { useAuth } from "@repo/ui";
import { Loader2 } from "lucide-react";

function AppRouter() {
  // Use the token expiration hook inside the router context
  useTokenExpiration();

  return (
    <Routes>
      {/* Legacy /@handle/edit/... URLs are normalized to the panel route by Editor */}
      <Route
        path="/:handle/edit/:panel?"
        element={
          <ProtectedRoute>
            <Editor />
          </ProtectedRoute>
        }
      />

      {/* The client only serves the dashboard of the logged-in user; the panel
          (home, gallery, wallet, ...) is the route */}
      <Route
        path="/:panel?"
        element={
          <ProtectedRoute>
            <Editor />
          </ProtectedRoute>
        }
      />

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
        <AppToaster />
      </EditorProvider>
    </BrowserRouter>
  );
}

export default App;
