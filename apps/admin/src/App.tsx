import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { AuthProvider, Toaster } from "@repo/ui";
import { ProtectedRoute } from "./ProtectedRoute";
import {
  AdminLayout,
  AdminDashboard,
  AdminUsers,
  AdminThemes,
  AdminBlocks,
  AdminFiles,
  AdminPools,
  AdminNdauConversions,
} from "./pages";

function AppRouter() {
  return (
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
        <Route path="blocks" element={<AdminBlocks />} />
        <Route path="files" element={<AdminFiles />} />
        <Route path="pools" element={<AdminPools />} />
        <Route path="ndau-conversions" element={<AdminNdauConversions />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
