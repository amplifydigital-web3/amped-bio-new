import { useRef } from "react";

// Hook for managing invisible captcha
export const useCaptcha = () => {
  const isRecaptchaEnabled =
    import.meta.env.MODE !== "testing" && !!import.meta.env.VITE_RECAPTCHA_SITE_KEY;

  const executeCaptcha = async (action: string = 'LOGIN'): Promise<string | null> => {
    if (!isRecaptchaEnabled) {
      return null;
    }

    if (!window.grecaptcha || !window.grecaptcha.enterprise) {
      console.error('reCAPTCHA enterprise is not loaded');
      return null;
    }

    try {
      await window.grecaptcha.enterprise.ready();
      const token = await window.grecaptcha.enterprise.execute(import.meta.env.VITE_RECAPTCHA_SITE_KEY, { action });
      return token;
    } catch (error) {
      console.error('Error executing reCAPTCHA:', error);
      return null;
    }
  };

  return {
    executeCaptcha,
    isRecaptchaEnabled,
  };
};
