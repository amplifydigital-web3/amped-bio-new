"use client";
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields, jwtClient, twoFactorClient } from "better-auth/client/plugins";

// Client-side mirror of the server auth schema (see apps/server/src/utils/auth.ts).
// Defined inline so this package stays decoupled from the server implementation.
export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({
      user: {
        handle: {
          type: "string",
          required: false,
        },
        role: {
          type: "string",
          required: false,
          input: false,
        },
        image: {
          type: "string",
          required: false,
        },
        twoFactorEnabled: {
          type: "boolean",
          required: false,
          input: false,
        },
      },
    }),
    jwtClient(),
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = "/auth/two-factor";
      },
    }),
    // oneTapClient({
    //   clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    // }),
  ],
  /** The base URL of the server (optional if you're using the same domain) */
  baseURL: (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_URL,
  basePath: "/auth",
});

export const oneTapCall = async () => {
  try {
    // await authClient.oneTap({
    //   callbackURL: "/", // redirect '/' route after login
    //   cancelOnTapOutside: true, // cancel oneTap when user Taps outside the oneTap component
    //   context: "signin", // signin or signup or use
    //   autoSelect: true, // auto select the account to be true
    // });
  } catch (error) {
    console.log(error);
  }
};

export type Session = typeof authClient.$Infer.Session;
