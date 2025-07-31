import { useState, useRef, useCallback } from "react";
import ReCAPTCHA from "react-google-recaptcha";

export const useCaptchaModal = () => {
  const [showCaptchaModal, setShowCaptchaModal] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const onCompleteCallback = useRef<(token: string | null) => void>();

  const openCaptchaModal = useCallback((onComplete: (token: string | null) => void) => {
    onCompleteCallback.current = onComplete;
    setShowCaptchaModal(true);
  }, []);

  const closeCaptchaModal = useCallback(() => {
    setShowCaptchaModal(false);
    if (onCompleteCallback.current) {
      onCompleteCallback.current(null); //  Indicate that the captcha was not completed
    }
  }, []);

  const handleVerifyCaptcha = useCallback((token: string | null) => {
    setCaptchaToken(token);
    if (onCompleteCallback.current) {
      onCompleteCallback.current(token);
    }
    setShowCaptchaModal(false);
  }, []);

  return {
    showCaptchaModal,
    captchaToken,
    recaptchaRef,
    openCaptchaModal,
    closeCaptchaModal,
    handleVerifyCaptcha,
  };
};
