import { useRef, useState } from "react";
import ReCAPTCHA from "react-google-recaptcha";

/**
 * Hook para gerenciar o estado e a lógica do modal de captcha
 * @returns Objeto com funções e estados para controlar o modal de captcha
 */
export function useCaptchaModal() {
  const [showCaptchaModal, setShowCaptchaModal] = useState(false);
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  /**
   * Abre o modal de captcha e reseta o token
   */
  const openCaptchaModal = () => {
    setShowCaptchaModal(true);
    setCaptchaToken(null);
  };

  /**
   * Fecha o modal de captcha
   */
  const closeCaptchaModal = () => {
    setShowCaptchaModal(false);
    if (recaptchaRef.current) {
      recaptchaRef.current.reset();
    }
  };

  /**
   * Processa a verificação do captcha
   * @param token Token recebido do captcha
   * @returns O token verificado
   */
  const handleVerifyCaptcha = (token: string | null) => {
    setCaptchaToken(token);
    return token;
  };

  /**
   * Completa o processo do captcha e executa um callback opcional
   * @param token Token recebido do captcha
   * @param onSuccess Callback a ser executado em caso de sucesso
   */
  const handleCaptchaComplete = (token: string | null, onSuccess?: (token: string) => void) => {
    // Se temos um token e um callback de sucesso, execute-o
    if (token && onSuccess) {
      onSuccess(token);
    }

    // Feche o modal logo após a conclusão
    closeCaptchaModal();
  };

  return {
    showCaptchaModal,
    recaptchaRef,
    captchaToken,
    openCaptchaModal,
    closeCaptchaModal,
    handleVerifyCaptcha,
    handleCaptchaComplete,
  };
}
