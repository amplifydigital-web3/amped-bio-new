import { useState, useEffect, useRef } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

  const handleSubmitInternal = () => {
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Please verify you're human</DialogTitle>
        </DialogHeader>
        {isRecaptchaEnabled ? (
          <div className="flex flex-col items-center gap-4">
            <ReCAPTCHA
              sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY}
              ref={recaptchaRef}
              onChange={handleRecaptchaChange}
              className="flex justify-center"
            />
            <button
              onClick={handleSubmitInternal}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              Continue
            </button>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-gray-600 mb-4">ReCAPTCHA is disabled in this environment.</p>
            <button
              onClick={handleSubmitInternal}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              Continue
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
