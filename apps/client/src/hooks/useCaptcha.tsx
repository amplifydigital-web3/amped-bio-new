// Hook for managing the invisible captcha (Cap proof-of-work)
const CAPTCHA_SERVER_URL = import.meta.env.VITE_CAPTCHA_SERVER_URL;
const CAPTCHA_SITE_KEY = import.meta.env.VITE_CAPTCHA_SITE_KEY;

export const useCaptcha = () => {
  const isCaptchaEnabled =
    import.meta.env.MODE !== "testing" && !!CAPTCHA_SERVER_URL && !!CAPTCHA_SITE_KEY;

  const executeCaptcha = async (): Promise<string | null> => {
    if (!isCaptchaEnabled) {
      return null;
    }

    try {
      const capModule = await import("@cap.js/widget");
      const Cap = capModule.default ?? capModule.Cap;
      const cap = new Cap({ apiEndpoint: `${CAPTCHA_SERVER_URL}/${CAPTCHA_SITE_KEY}/` });
      const { token } = await cap.solve();
      return token || null;
    } catch (error) {
      console.error("Error executing Cap captcha:", error);
      return null;
    }
  };

  return {
    executeCaptcha,
    isCaptchaEnabled,
  };
};
