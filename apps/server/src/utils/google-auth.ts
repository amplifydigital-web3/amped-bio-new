// Interface for Google OAuth user info
interface GoogleUserInfo {
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}

// Function to verify Google OAuth token
export async function verifyGoogleToken(accessToken: string): Promise<GoogleUserInfo> {
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch user info from Google");
    }

    const data = await response.json();

    if (!data.email) {
      throw new Error("Google account must have an email");
    }

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
