import { authClient } from "./auth-client";

// The account may exist when sign up does not answer, so the card no longer
// says it was not created. Retry signs in when it was.
export const SIGN_UP_UNCONFIRMED_TITLE = "We could not confirm your account";
export const SIGN_UP_UNCONFIRMED_BODY =
  "Check your connection, then Retry. If your account was created, Retry signs you in.";

export type LostSignUpOutcome = "signedIn" | "redirected" | "failed";

/**
 * Sign up can create the account and still not answer: the response is lost
 * to a timeout, or a step after the insert fails. The card then said the
 * account was not created, and Retry hit "email taken" because the first
 * attempt had in fact made it.
 *
 * Signing in with the same email and password settles it. Success proves the
 * account exists and belongs to this person, so the flow can continue as if
 * sign up had answered. Any failure leaves the caller's error in place.
 */
export async function signInAfterLostSignUp(
  email: string,
  password: string,
  executeCaptcha: () => Promise<string | null>,
  isCaptchaEnabled: boolean
): Promise<LostSignUpOutcome> {
  try {
    // A captcha token is single use; the sign up spent the last one
    const token = await executeCaptcha();
    if (isCaptchaEnabled && !token) return "failed";
    const result = await authClient.signIn.email({
      email,
      password,
      fetchOptions: {
        headers: token ? { "x-captcha-response": token } : undefined,
      },
    });
    if (result?.error || !result?.data) return "failed";
    // Two factor sign in redirects on its own (auth-client onTwoFactorRedirect)
    if ("twoFactorRedirect" in result.data && result.data.twoFactorRedirect) return "redirected";
    return "signedIn";
  } catch {
    return "failed";
  }
}
