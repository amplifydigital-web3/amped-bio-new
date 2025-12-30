import { CaptchaActions } from "@ampedbio/constants";

// Hook for managing invisible captcha
export const useCaptcha = () => {
  const isRecaptchaEnabled =
    import.meta.env.MODE !== "testing" && !!import.meta.env.VITE_CAPTCHA_SITE_KEY;

  const executeCaptcha = (
    action: CaptchaActions = CaptchaActions.LOGIN
  ): Promise<string | null> => {
    if (!isRecaptchaEnabled) {
      return Promise.resolve(null);
    }

    if (!window.grecaptcha || !window.grecaptcha.enterprise) {
      console.error("reCAPTCHA enterprise is not loaded");
      return Promise.resolve(null);
    }

    // Store references to avoid type narrowing issues
    const recaptcha = window.grecaptcha;

    if (!recaptcha) {
      console.error("reCAPTCHA is not available on window");
      return Promise.resolve(null);
    }

    const enterprise = recaptcha.enterprise;

    if (!enterprise) {
      console.error("reCAPTCHA enterprise is not available");
      return Promise.resolve(null);
    }

    return new Promise(resolve => {
      enterprise.ready(async () => {
        try {
          const token = await enterprise.execute(import.meta.env.VITE_CAPTCHA_SITE_KEY, { action });
          resolve(token);
        } catch (error) {
          console.error("Error executing reCAPTCHA:", error);
          resolve(null);
        }
      });
    });
  };

  return {
    executeCaptcha,
    isRecaptchaEnabled,
  };
};
