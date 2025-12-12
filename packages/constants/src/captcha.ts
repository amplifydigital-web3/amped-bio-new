/**
 * Constants for reCAPTCHA actions
 */
export enum CaptchaActions {
  /** Used for user login authentication */
  LOGIN = "LOGIN",
  /** Used for user registration process */
  REGISTER = "REGISTER",
  /** Used when user requests password reset */
  RESET_PASSWORD = "RESET_PASSWORD",
  /** Used for contact form submissions */
  CONTACT = "CONTACT",
  /** Used for general form submissions */
  SUBMIT_FORM = "SUBMIT_FORM",
}
