import React, { useState, useEffect } from "react";
import { X, Trophy, Coins, CheckCircle, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter,
} from "@/components/ui/dialog";
import { useFundWalletDialog } from "./hooks/useFundWalletDialog";
import { useCaptchaModal } from "@/components/captcha/useCaptchaModal";
import { CaptchaModal } from "@/components/captcha/CaptchaModal";

interface ClaimRewardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pool: {
    id: string;
    title: string;
    earnedRewards: number;
    rewardCurrency: string;
    image?: string;
  } | null;
}

export default function ClaimRewardsModal({ isOpen, onClose, pool }: ClaimRewardsModalProps) {
  const [step, setStep] = useState<"confirm" | "claiming" | "success">("confirm");
  const [animatingTokens, setAnimatingTokens] = useState<Array<{ id: number; delay: number }>>([]);
  const [isRecaptchaEnabled] = useState(Boolean(import.meta.env.VITE_RECAPTCHA_SITE_KEY));

  // Usar o hook de captcha
  const {
    showCaptchaModal,
    recaptchaRef,
    captchaToken,
    openCaptchaModal,
    closeCaptchaModal,
    handleVerifyCaptcha,
  } = useCaptchaModal();

  const { handleClaim: handleFaucetClaim } = useFundWalletDialog({
    open: isOpen,
    onOpenChange: onClose,
    recaptchaToken: captchaToken,
  });

  useEffect(() => {
    if (isOpen) {
      setStep("confirm");
      setAnimatingTokens([]);
    } else {
      // Quando o modal principal é fechado, certifique-se de fechar o modal de captcha também
      closeCaptchaModal();
    }
  }, [isOpen, closeCaptchaModal]);

  if (!isOpen || !pool) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && step !== "claiming") {
      onClose();
    }
  };

  const handleClaim = async () => {
    // Se o captcha está habilitado e não temos um token, abra o modal de captcha
    if (isRecaptchaEnabled && !captchaToken) {
      openCaptchaModal();
      return;
    }

    setStep("claiming");

    console.log("Claiming rewards with reCAPTCHA token:", captchaToken);

    // Call the handleClaim from the hook (the token is passed through props to the hook)
    const result = await handleFaucetClaim();

    if (result.success) {
      // Create multiple token animations with staggered delays
      const tokens = Array.from({ length: 8 }, (_, i) => ({
        id: i,
        delay: i * 150, // Stagger by 150ms
      }));
      setAnimatingTokens(tokens);

      // Simulate API call delay
      setTimeout(() => {
        setStep("success");

        // Auto-close after showing success
        setTimeout(() => {
          onClose();
        }, 2500);
      }, 2000);
    } else {
      // Handle error if claim fails
      setStep("confirm"); // Go back to confirm step
      // Optionally show an error message to the user
    }
  };

  const handleClose = () => {
    if (step !== "claiming") {
      onClose();
    }
  };

  const renderConfirmStep = () => (
    <>
      <DialogHeader className="border-b border-gray-200 p-6">
        <DialogTitle className="text-xl font-bold text-gray-900">Claim Rewards</DialogTitle>
        <DialogClose
          className="absolute right-4 top-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200"
          onClick={handleClose}
          disabled={step === "claiming"}
        />
      </DialogHeader>

      <div className="p-6 space-y-6">
        {/* Pool Info */}
        <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
          <div className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 flex-shrink-0">
            {pool.image ? (
              <img
                src={pool.image}
                alt={`${pool.title} pool`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                <Trophy className="w-6 h-6 text-gray-500" />
              </div>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{pool.title}</h3>
            <p className="text-sm text-gray-600">Reward Pool</p>
          </div>
        </div>

        {/* Reward Amount */}
        <div className="text-center py-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <Coins className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">
            {pool.earnedRewards.toLocaleString()} {pool.rewardCurrency}
          </h3>
          <p className="text-gray-600">Available to claim</p>
        </div>

        {/* Confirmation Message */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>Confirm:</strong> You are about to claim {pool.earnedRewards.toLocaleString()}{" "}
            {pool.rewardCurrency}
            from the {pool.title} pool. This action cannot be undone.
          </p>
        </div>

        {/* Action Buttons */}
        <DialogFooter className="flex space-x-3">
          <button
            onClick={handleClose}
            className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors duration-200"
          >
            Cancel
          </button>
          <button
            onClick={handleClaim}
            className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors duration-200 flex items-center justify-center space-x-2"
          >
            <Coins className="w-4 h-4" />
            <span>Claim Rewards</span>
          </button>
        </DialogFooter>
      </div>
    </>
  );

  const renderClaimingStep = () => (
    <>
      <DialogHeader className="border-b border-gray-200 p-6">
        <DialogTitle className="text-xl font-bold text-gray-900">Claiming Rewards</DialogTitle>
      </DialogHeader>

      <div className="p-6 relative overflow-hidden" style={{ minHeight: "400px" }}>
        {/* Pool Icon - Source */}
        <div className="absolute top-8 left-1/2 transform -translate-x-1/2">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center border-4 border-white shadow-lg">
            <Trophy className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        {/* Wallet Icon - Destination */}
        <div className="absolute bottom-8 right-8">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center border-4 border-white shadow-lg">
            <Coins className="w-6 h-6 text-green-600" />
          </div>
        </div>

        {/* Animated Tokens */}
        {animatingTokens.map(token => (
          <div
            key={token.id}
            className="absolute w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm shadow-lg animate-bounce"
            style={{
              top: "4rem",
              left: "50%",
              transform: "translateX(-50%)",
              animationName: "tokenFly",
              animationDuration: "1.5s",
              animationTimingFunction: "ease-out",
              animationDelay: `${token.delay}ms`,
              animationFillMode: "forwards",
            }}
          >
            {pool.rewardCurrency === "REVO" ? "🚀" : "💰"}
          </div>
        ))}

        {/* Center Content */}
        <div className="flex flex-col items-center justify-center h-full pt-16 pb-16">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-6"></div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Processing Claim</h3>
          <p className="text-gray-600 text-center">
            Transferring {pool.earnedRewards.toLocaleString()} {pool.rewardCurrency} to your
            wallet...
          </p>
        </div>

        {/* Sparkle Effects */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(6)].map((_, i) => (
            <Sparkles
              key={i}
              className="absolute w-4 h-4 text-yellow-400 animate-pulse"
              style={{
                top: `${20 + i * 15}%`,
                left: `${10 + i * 15}%`,
                animationDelay: `${i * 200}ms`,
              }}
            />
          ))}
        </div>
      </div>

      <style>
        {`
          @keyframes tokenFly {
            0% {
              top: 4rem;
              left: 50%;
              transform: translateX(-50%) scale(1);
              opacity: 1;
            }
            50% {
              transform: translateX(-50%) scale(1.2);
            }
            100% {
              top: calc(100% - 6rem);
              left: calc(100% - 4rem);
              transform: translateX(0) scale(0.8);
              opacity: 0.8;
            }
          }
        `}
      </style>
    </>
  );

  const renderSuccessStep = () => (
    <>
      <DialogHeader className="border-b border-gray-200 p-6">
        <DialogTitle className="text-xl font-bold text-green-900">Rewards Claimed!</DialogTitle>
      </DialogHeader>

      <div className="p-6 text-center space-y-6">
        {/* Success Icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4 animate-pulse">
          <CheckCircle className="w-12 h-12 text-green-600" />
        </div>

        {/* Success Message */}
        <div>
          <h3 className="text-2xl font-bold text-green-900 mb-2">Success!</h3>
          <p className="text-gray-600 mb-4">
            You've successfully claimed{" "}
            <strong>
              {pool.earnedRewards.toLocaleString()} {pool.rewardCurrency}
            </strong>{" "}
            from {pool.title}
          </p>
        </div>

        {/* Wallet Update Notice */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-800">
            💰 Your wallet balance has been updated with the claimed rewards.
          </p>
        </div>

        {/* Auto-close notice */}
        <p className="text-xs text-gray-500">This window will close automatically...</p>
      </div>
    </>
  );

  return (
    <>
      {/* Modal de captcha */}
      <CaptchaModal
        showModal={showCaptchaModal}
        recaptchaRef={recaptchaRef}
        onClose={closeCaptchaModal}
        onVerify={handleVerifyCaptcha}
      />

      {/* Dialog principal */}
      <Dialog
        open={isOpen}
        onOpenChange={open => {
          if (!open && step !== "claiming") {
            onClose();
          }
        }}
      >
        <DialogContent className="max-w-md p-0 overflow-hidden">
          {step === "confirm" && renderConfirmStep()}
          {step === "claiming" && renderClaimingStep()}
          {step === "success" && renderSuccessStep()}
        </DialogContent>
      </Dialog>
    </>
  );
}
