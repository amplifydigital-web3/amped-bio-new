import axios from "axios";
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
    const response = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status !== 200) {
      throw new Error("Failed to verify Google token");
    }

    const data = response.data;

    // Validate that the email is verified
    if (!data.email_verified) {
      throw new Error("Email not verified with Google");
    }

    return {
      email: data.email,
      email_verified: data.email_verified,
      name: data.name,
      picture: data.picture,
    };
  } catch (error) {
    console.error("Error verifying Google token:", error);
    throw new Error("Invalid Google token");
  }
}
