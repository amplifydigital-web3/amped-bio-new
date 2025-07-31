import ReCAPTCHA from "react-google-recaptcha";
import { X } from "lucide-react";

/**
 * Componente do modal de captcha
 */
export function CaptchaModal({
  showModal,
  recaptchaRef,
  onClose,
  onVerify,
}: {
  showModal: boolean;
  recaptchaRef: React.RefObject<ReCAPTCHA>;
  onClose: () => void;
  onVerify: (token: string | null) => void;
}) {
  if (!showModal) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[9999] bg-black/50"
      style={{ isolation: "isolate" }}
    >
      <div className="bg-white rounded-2xl p-5 max-w-md relative z-[10000]">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-800"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Verify Captcha</h2>
          <p className="text-sm text-gray-500">
            Please complete the captcha verification to claim your daily faucet tokens.
          </p>
        </div>
        <div className="flex justify-center py-4 overflow-visible">
          <ReCAPTCHA
            sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY}
            onChange={onVerify}
            onExpired={() => onVerify(null)}
            ref={recaptchaRef}
            size="normal"
          />
        </div>
      </div>
    </div>
  );
}
