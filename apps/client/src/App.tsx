import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router";
import { Editor } from "./pages/Editor";

import { ProtectedRoute } from "./components/ProtectedRoute";
import { Toaster, toast as hotToast, resolveValue } from "react-hot-toast";
import { EditorProvider } from "./contexts/EditorContext";
import { SessionEndedDialog } from "./components/shell/SessionEndedDialog";
import { signInUrl } from "./components/shell/ShellGate";
import { useReferralHandler } from "./hooks/useReferralHandler";
import { ExternalRedirect, ToastCard, useAuth } from "@repo/ui";
import { ERROR_TOAST_DURATION } from "@/components/ui/toast";

// Internal Prism component gallery for review (not linked in the app). Served in
// development, testing and staging builds only, never in production.
const SHOW_PRISM_GALLERY = import.meta.env.MODE !== "production";
const PrismGallery = lazy(() =>
  import("./pages/PrismGallery").then(module => ({ default: module.PrismGallery }))
);

function AppRouter() {
  return (
    <>
      {/* 081 I09: any 401 during a session opens Your session ended */}
      <SessionEndedDialog />
      <Routes>
        {SHOW_PRISM_GALLERY && (
          <Route
            path="/_prism"
            element={
              <ProtectedRoute>
                <Suspense fallback={null}>
                  <PrismGallery />
                </Suspense>
              </ProtectedRoute>
            }
          />
        )}
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
    </>
  );
}

// 081 I04, I05: any other path belongs to the public site. While the session
// is read and the cross origin redirect runs, only the room paints. Signed out
// visitors go to sign in with this URL as returnTo.
function PublicSiteRedirect() {
  const { authUser, isPending } = useAuth();

  if (isPending) return <div className="prism-room min-h-dvh" />;

  return (
    <>
      <div className="prism-room min-h-dvh" />
      <ExternalRedirect
        to={authUser === null ? signInUrl() : import.meta.env.VITE_LANDINGPAGE_URL}
      />
    </>
  );
}

function App() {
  useReferralHandler();

  return (
    <BrowserRouter>
      <EditorProvider>
        <AppRouter />
        {/* The one toast stack (Screen Review 084, D21): react-hot-toast calls and
            toast.add from components/ui/toast render as the Prism ToastCard.
            Errors leave after 10 seconds, success and info after 5. */}
        <Toaster
          position="bottom-left"
          containerClassName="!bottom-[104px] !left-4 sm:!bottom-[34px] sm:!left-[34px]"
          toastOptions={{ duration: 5000, error: { duration: ERROR_TOAST_DURATION } }}
        >
          {t =>
            t.type === "custom" ? (
              <>{resolveValue(t.message, t)}</>
            ) : (
              <ToastCard
                type={t.type === "blank" ? "default" : t.type}
                title={resolveValue(t.message, t)}
                onDismiss={t.type === "loading" ? undefined : () => hotToast.dismiss(t.id)}
                className={
                  t.visible
                    ? "animate-in fade-in slide-in-from-bottom-2 duration-prism-control ease-prism motion-reduce:animate-none"
                    : "animate-out fade-out duration-prism-hover ease-prism motion-reduce:animate-none"
                }
              />
            )
          }
        </Toaster>
      </EditorProvider>
    </BrowserRouter>
  );
}

export default App;
