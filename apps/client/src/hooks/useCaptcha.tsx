import { useState, useEffect, useRef } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import { X } from "lucide-react";

// Hook for managing captcha state and opening the dialog
export const useCaptcha = () => {
  const [isOpen, setIsOpen] = useState(false);
  const resolveRef = useRef<((token: string | null) => void) | null>(null);
  const isRecaptchaEnabled =
    import.meta.env.MODE !== "testing" && !!import.meta.env.VITE_RECAPTCHA_SITE_KEY;

  const openCaptcha = (): Promise<string | null> => {
    return new Promise(resolve => {
      resolveRef.current = resolve;
      setIsOpen(true);
    });
  };

  const closeCaptcha = () => {
    setIsOpen(false);
    if (resolveRef.current) {
      resolveRef.current(null);
      resolveRef.current = null;
    }
  };

  const handleSubmit = (token: string | null) => {
    setIsOpen(false);
    if (resolveRef.current) {
      resolveRef.current(token);
      resolveRef.current = null;
    }
  };

  return {
    isOpen,
    openCaptcha,
    closeCaptcha,
    handleSubmit,
    isRecaptchaEnabled,
  };
};

// Dialog component for displaying the captcha
interface CaptchaDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (token: string | null) => void;
}

export function CaptchaDialog({ isOpen, onClose, onSubmit }: CaptchaDialogProps) {
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const isRecaptchaEnabled =
    import.meta.env.MODE !== "testing" && !!import.meta.env.VITE_RECAPTCHA_SITE_KEY;

  useEffect(() => {
    if (isOpen && isRecaptchaEnabled && recaptchaRef.current) {
      // Reset the reCAPTCHA when the dialog opens
      recaptchaRef.current.reset();
    }
  }, [isOpen, isRecaptchaEnabled]);

  const handleSubmit = () => {
    if (isRecaptchaEnabled && recaptchaRef.current) {
      const token = recaptchaRef.current.getValue();
      onSubmit(token);
    } else {
      // If reCAPTCHA is disabled (e.g., in testing), resolve with null
      onSubmit(null);
    }
  };

  const handleRecaptchaChange = (token: string | null) => {
    if (token) {
      onSubmit(token);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="captcha-dialog-title"
    >
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 id="captcha-dialog-title" className="text-xl font-semibold">
            Please verify you're human
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700"
            aria-label="Close captcha dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isRecaptchaEnabled ? (
          <div className="flex flex-col items-center gap-4">
            <ReCAPTCHA
              sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY}
              ref={recaptchaRef}
              onChange={handleRecaptchaChange}
              className="flex justify-center"
            />
            <button
              onClick={handleSubmit}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              Continue
            </button>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-gray-600 mb-4">ReCAPTCHA is disabled in this environment.</p>
            <button
              onClick={handleSubmit}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
