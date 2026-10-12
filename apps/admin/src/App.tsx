import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { AuthProvider, NewVersionDialog, Toaster } from "@repo/ui";
import { ProtectedRoute } from "./ProtectedRoute";
import {
  AdminLayout,
  AdminDashboard,
  AdminUsers,
  AdminThemes,
  AdminNewTheme,
  AdminFiles,
  AdminPools,
  AdminNdauConversions,
  AdminOAuthClients,
  AdminBroadcasts,
  AdminTelegram,
  AdminMoney,
} from "./pages";

function AppRouter() {
  return (
    <>
      {/* Detects a newer deployed build and offers to reload */}
      <NewVersionDialog />
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="themes" element={<AdminThemes />} />
          <Route path="themes/new" element={<AdminNewTheme />} />
          {/* 088 I09: the Blocks placeholder is not rendered */}
          <Route path="blocks" element={<Navigate to="/" replace />} />
          <Route path="files" element={<AdminFiles />} />
          <Route path="pools" element={<AdminPools />} />
          <Route path="ndau-conversions" element={<AdminNdauConversions />} />
          <Route path="oauth-clients" element={<AdminOAuthClients />} />
          <Route path="broadcasts" element={<AdminBroadcasts />} />
          <Route path="telegram" element={<AdminTelegram />} />
          <Route path="money" element={<AdminMoney />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
