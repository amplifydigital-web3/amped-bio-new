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
  AdminOAuthClients,
  AdminBroadcasts,
  AdminTelegram,
  AdminMoney,
  PaymentsOverview,
  PaymentsSettings,
  PaymentsLog,
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
          <Route path="oauth-clients" element={<AdminOAuthClients />} />
          <Route path="broadcasts" element={<AdminBroadcasts />} />
          <Route path="telegram" element={<AdminTelegram />} />
          <Route path="money" element={<AdminMoney />} />
          {/* AmpedPay admin controls (Build Board #50): boards a1, a2 and a4 */}
          <Route path="payments" element={<PaymentsOverview />} />
          <Route path="payments/settings" element={<PaymentsSettings />} />
          <Route path="payments/log" element={<PaymentsLog />} />
          {/* ndau conversions moved to the support portal; old links land on the dashboard */}
          <Route path="ndau-conversions" element={<Navigate to="/" replace />} />
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
