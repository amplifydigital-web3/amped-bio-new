"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields, jwtClient, twoFactorClient } from "better-auth/client/plugins";
import { auth } from "../../../server/src/utils/auth";

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<typeof auth>(),
    jwtClient(),
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = "/auth/two-factor";
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
