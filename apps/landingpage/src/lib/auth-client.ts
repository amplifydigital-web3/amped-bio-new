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
  baseURL: process.env.NEXT_PUBLIC_API_URL || "/api",
  basePath: "/auth",
});

export type Session = typeof authClient.$Infer.Session;
