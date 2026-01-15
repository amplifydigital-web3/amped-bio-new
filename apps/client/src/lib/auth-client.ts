import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields, jwtClient } from "better-auth/client/plugins";
import { auth } from "../../../server/src/utils/auth";

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields<typeof auth>(),
    jwtClient(),
    // oneTapClient({
    //   clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    // }),
  ],
  /** The base URL of the server (optional if you're using the same domain) */
  baseURL: import.meta.env.VITE_API_URL,
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
