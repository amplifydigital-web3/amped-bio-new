import { env } from "../env";

export async function verifyRecaptcha(token: string | null): Promise<boolean> {
  if (env.NODE_ENV === "testing") {
    return true;
  }

  if (env.CAPTCHA_SECRET_KEY.length === 0) {
    console.warn("CAPTCHA_SECRET_KEY is not set. Skipping reCAPTCHA verification.");
    return true;
  }

  if (!token) {
    return false;
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", env.CAPTCHA_SECRET_KEY);
    formData.append("response", token);

    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData,
    });

    const data = await response.json();

    if (data.success) {
      const score = data.score || 1.0;

      if (score < 0.5) {
        console.warn("reCAPTCHA score too low (bot detected):", score);
        return false;
      }

      return true;
    } else {
      console.warn("reCAPTCHA verification failed:", data["error-codes"]);
      return false;
    }
  } catch (error) {
    console.error("Error verifying reCAPTCHA:", error);
    return false;
  }
}
