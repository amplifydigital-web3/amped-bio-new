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
  AdminSettings 
} from "./pages/admin";
import { initParticlesEngine } from "@tsparticles/react";
//import { loadSlim } from '@tsparticles/slim';
import { loadAll } from "@tsparticles/all";
import { AppKitProvider } from "./components/connect/components/AppKitProvider";
import {
  EmailVerification,
  EmailVerificationResent,
  PasswordReset,
} from "./pages/auth";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./utils/trpc";
import { Toaster } from 'react-hot-toast';

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
      setInit(true);
    });
  }, []);

  if (init) {
    return (
      <>
        <QueryClientProvider client={queryClient}>
          <AppKitProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/:onelink/edit" element={<Editor />} />
                <Route path="/:onelink" element={<View />} />
                <Route path="/register" element={<View />} />
                <Route path="/" element={<View />} />
                
                {/* Admin Routes with nested routing */}
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="themes" element={<AdminThemes />} />
                  <Route path="blocks" element={<AdminBlocks />} />
                  <Route path="files" element={<AdminFiles />} />
                  <Route path="settings" element={<AdminSettings />} />
                </Route>
                
                <Route path="/account" element={<Account />} />

                {/* Authentication Routes */}
                <Route path="/auth/verify-email/:token?" element={<EmailVerification />} />
                <Route path="/auth/resend-verification" element={<EmailVerificationResent />} />
                <Route path="/auth/reset-password/:token?" element={<PasswordReset />} />
              </Routes>
            </BrowserRouter>
          </AppKitProvider>
        </QueryClientProvider>
        <Toaster />
      </>
    );
  }
  return <></>;
}

export default App;
