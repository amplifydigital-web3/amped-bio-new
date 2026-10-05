"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields, jwtClient, twoFactorClient } from "better-auth/client/plugins";
import { auth } from "../../../server/src/utils/auth";

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<typeof auth>(),
    jwtClient(),
    twoFactorClient({
      // Keep where sign in was headed (Screen Review 014, D27): an OAuth
      // authorize page comes back to itself, otherwise returnTo or redirect
      onTwoFactorRedirect() {
        const { pathname, search } = window.location;
        const query = new URLSearchParams(search);
        const returnTo = pathname.startsWith("/oauth/")
          ? `${pathname}${search}`
          : query.get("returnTo") || query.get("redirect");
        window.location.href = `/auth/two-factor${
          returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""
        }`;
      },
    }),
  ],
  // Better Auth is served by apps/auth-server at the root of the auth subdomain.
  baseURL: process.env.NEXT_PUBLIC_AUTH_URL || "https://auth.amped.bio",
  basePath: "",
  fetchOptions: {
    credentials: "include",
  },
});

export type Session = typeof authClient.$Infer.Session;
