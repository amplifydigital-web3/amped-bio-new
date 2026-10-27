import { ReactNode, useEffect } from "react";
import { Navigate } from "react-router";
import { useAuth } from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { ShellPending, signInUrl } from "./shell/ShellGate";

interface ProtectedRouteProps {
  children: ReactNode;
  adminOnly?: boolean;
}

/**
 * Screen Review 081 I01, I05, I08. While the session is read, the room and
 * then the shell skeleton; after 10 s, the timeout card. Signed out goes to
 * the public sign in with the exact app URL as returnTo, so deep links such
 * as /explore?pool=<address> survive sign in.
 */
export function ProtectedRoute({ children, adminOnly = false }: ProtectedRouteProps) {
  const { isPending, authUser } = useAuth();
  const { keepUnsavedEdits } = useEditor();
  const signedOut = !isPending && authUser === null;

  // A session that ends while editing keeps the unsaved edits for after sign
  // in (081 I09), then leaves with the exact app URL as returnTo
  useEffect(() => {
    if (!signedOut) return;
    keepUnsavedEdits();
    window.location.replace(signInUrl());
  }, [signedOut, keepUnsavedEdits]);

  // The auth context has no refetch; a reload reads the session again
  if (isPending) return <ShellPending onRetry={() => window.location.reload()} />;

  if (authUser === null) return <div className="prism-room min-h-dvh" />;

  if (adminOnly && !authUser.role.includes("admin")) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
