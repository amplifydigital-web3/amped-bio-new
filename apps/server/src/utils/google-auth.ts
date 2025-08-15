import { OAuth2Client } from "google-auth-library";

import { env } from "../env";

// Interface for Google OAuth user info
interface GoogleUserInfo {
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}

// Function to verify Google OAuth token
export async function verifyGoogleToken(token: string): Promise<GoogleUserInfo> {
  try {
    const client = new OAuth2Client({ client_secret: env.GOOGLE_CLIENT_SECRET });
    const ticket = await client.verifyIdToken({
      idToken: token,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) throw new Error("Google account must have an email");

    const data = payload;

    // Validate that the email is verified
    if (!data.email_verified) {
      throw new Error("Email not verified with Google");
    }

    return {
      email: data.email!,
      email_verified: data.email_verified,
      name: data.name,
      picture: data.picture,
    };
  } catch (error) {
    console.error("Error verifying Google token:", error);
    throw new Error("Invalid Google token");
  }
}
