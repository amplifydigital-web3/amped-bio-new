import axios from "axios";
import { env } from "../env";

export async function verifyRecaptcha(token: string | null): Promise<boolean> {
  if (env.NODE_ENV === "testing") {
    return true;
  }

  if (!token) {
    return false;
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", env.RECAPTCHA_SECRET_KEY);
    formData.append("response", token);

    const response = await axios.post("https://www.google.com/recaptcha/api/siteverify", formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    console.info("reCAPTCHA response:", response.data);

    const data = response.data;

    if (data.success) {
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
