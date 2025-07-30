import axios from "axios";
import { env } from "../env";

export async function verifyRecaptcha(token: string | null): Promise<boolean> {
  if (!token) {
    return false;
  }

  try {
    const response = await axios.post(
      `https://www.google.com/recaptcha/api/siteverify?secret=${env.RECAPTCHA_SECRET_KEY}&response=${token}`
    );

    const data = response.data;

    if (data.success && data.score >= 0.5) {
      // You can adjust the score threshold based on your needs
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
