"use client";

import { GoogleSignInButton } from "@repo/ui";

// The /sign page (row 074) still imports this name; it renders the one shared
// Continue with Google button from @repo/ui (Screen Review 010 I01).
export function GoogleLoginButton({ onClick }: { onClick: () => void }) {
  return <GoogleSignInButton onClick={onClick} />;
}
