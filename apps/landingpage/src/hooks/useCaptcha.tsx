// Hook for managing the invisible captcha (Cap proof-of-work)
export const useCaptcha = () => {
  const serverUrl = process.env.NEXT_PUBLIC_CAPTCHA_SERVER_URL;
  const siteKey = process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY;
  const isCaptchaEnabled = !!serverUrl && !!siteKey;

  const executeCaptcha = async (): Promise<string | null> => {
    if (!serverUrl || !siteKey) {
      return null;
    }

    try {
      const capModule = await import("@cap.js/widget");
      const Cap = capModule.default ?? capModule.Cap;
      const cap = new Cap({ apiEndpoint: `${serverUrl}/${siteKey}/` });
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
