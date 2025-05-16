import { useState, useEffect, useRef } from "react";
import { X, Loader2, Check, AlertCircle } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { trpcClient } from "@/utils/trpc";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useAuthStore } from "@/store/authStore";

// Define validation schemas using Zod
const initiateEmailSchema = z
  .object({
    newEmail: z.string().email({ message: "Please enter a valid email address" }),
    confirmEmail: z.string().email({ message: "Please enter a valid email address" }),
  })
  .refine(data => data.newEmail === data.confirmEmail, {
    message: "Email addresses don't match",
    path: ["confirmEmail"],
  });

const confirmEmailSchema = z.object({
  code: z.string().length(6, { message: "Verification code must be 6 digits" }),
});

type InitiateEmailFormData = z.infer<typeof initiateEmailSchema>;
type ConfirmEmailFormData = z.infer<typeof confirmEmailSchema>;

interface EmailChangeDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EmailChangeDialog({ isOpen, onClose }: EmailChangeDialogProps) {
  const { authUser, updateAuthUser, setAuthToken } = useAuthStore();
  const [step, setStep] = useState<"enter_email" | "verification">("enter_email");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [remainingTime, setRemainingTime] = useState<string | null>(null);
  const [retryAfterTimestamp, setRetryAfterTimestamp] = useState<Date | null>(null);
  const timerRef = useRef<number | null>(null);

  // Form for initiating email change
  const {
    register: registerInitiate,
    handleSubmit: handleSubmitInitiate,
    formState: { errors: initiateErrors },
    reset: resetInitiateForm,
  } = useForm<InitiateEmailFormData>({
    resolver: zodResolver(initiateEmailSchema),
  });

  // Form for confirming email change
  const confirmForm = useForm<ConfirmEmailFormData>({
    resolver: zodResolver(confirmEmailSchema),
    defaultValues: {
      code: "",
    },
  });

  // Calculate remaining time for verification code
  const calculateRemainingTime = () => {
    if (!expiresAt) return null;
    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();
    if (diff <= 0) return "Expired";

    const minutes = Math.floor(diff / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // Set up timer to update countdown in real-time
  useEffect(() => {
    if (step === "verification" && expiresAt) {
      // Initial calculation
      setRemainingTime(calculateRemainingTime());

      // Set up interval to update every second
      timerRef.current = window.setInterval(() => {
        const timeLeft = calculateRemainingTime();
        setRemainingTime(timeLeft);

        // If expired, clear the interval
        if (timeLeft === "Expired") {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }
      }, 1000);
    }

    // Clean up interval on component unmount or when leaving verification step
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [step, expiresAt]);

  // Effect for timer to update countdown for rate limit
  useEffect(() => {
    let cooldownTimer: number | null = null;
    
    if (retryAfterTimestamp) {
      const updateCooldown = () => {
        const now = new Date();
        const diff = retryAfterTimestamp.getTime() - now.getTime();
        
        if (diff <= 0) {
          setResendCooldown(0);
          setRetryAfterTimestamp(null);
          // Clear error message when cooldown reaches zero
          if (error) setError(null);
          if (cooldownTimer) {
            clearInterval(cooldownTimer);
          }
        } else {
          // Update cooldown with accurate remaining seconds
          setResendCooldown(Math.ceil(diff / 1000));
        }
      };
      
      // Initial calculation
      updateCooldown();
      
      // Update every second
      cooldownTimer = window.setInterval(updateCooldown, 1000);
    }
    
    return () => {
      if (cooldownTimer) {
        clearInterval(cooldownTimer);
      }
    };
  }, [retryAfterTimestamp, error]);

  // Helper function to extract wait time from error messages and set retryAfter timestamp
  const extractWaitTimeFromError = (err: any): void => {
    // Check for rate limiting error with structured data in cause (new format with retryAfter)
    if (err?.shape?.data?.cause?.code === "RATE_LIMIT_EMAIL_VERIFICATION" && 
        typeof err?.shape?.data?.cause?.retryAfter === 'string') {
      
      try {
        const retryAfterDate = new Date(err.shape.data.cause.retryAfter);
        const now = new Date();
        const diffSeconds = Math.ceil((retryAfterDate.getTime() - now.getTime()) / 1000);
        
        if (diffSeconds > 0) {
          setRetryAfterTimestamp(retryAfterDate);
          setResendCooldown(diffSeconds); // Initial value until the effect updates it
        }
      } catch (e) {
        console.error("Error parsing retryAfter date:", e);
        setResendCooldown(60); // Fallback cooldown
      }
    }
    // Fallback to the previous timeLeftSeconds format
    else if (err?.shape?.data?.cause?.code === "RATE_LIMIT_EMAIL_VERIFICATION" && 
        typeof err?.shape?.data?.cause?.timeLeftSeconds === 'number') {
      setResendCooldown(err.shape.data.cause.timeLeftSeconds);
    }
    // Last resort fallback to the old method of extracting from text
    else if (err?.shape?.data?.code === "TOO_MANY_REQUESTS" && 
        err.message.includes("wait") && 
        err.message.includes("seconds")) {
      const secondsMatch = err.message.match(/wait\s+(\d+)\s+seconds/i);
      if (secondsMatch && secondsMatch[1]) {
        const seconds = parseInt(secondsMatch[1], 10);
        if (!isNaN(seconds) && seconds > 0) {
          setResendCooldown(seconds);
        }
      }
    }
  };

  // Handle initiating email change
  const onSubmitInitiateEmail = async (data: InitiateEmailFormData) => {
    setLoading(true);
    setError(null);

    try {
      const response = await trpcClient.user.initiateEmailChange.mutate({
        newEmail: data.newEmail,
      });

      if (response.success) {
        setStep("verification");
        setNewEmail(data.newEmail);
        setExpiresAt(new Date(response.expiresAt));
      } else {
        setError(response.message || "Failed to send verification code");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
      
      // Extract retry timestamp from error if available
      extractWaitTimeFromError(err);
    } finally {
      setLoading(false);
    }
  };

  // Handle confirming email change
  const onSubmitConfirmEmail = async (data: ConfirmEmailFormData) => {
    setLoading(true);
    setError(null);

    try {
      const response = await trpcClient.user.confirmEmailChange.mutate({
        code: data.code,
        newEmail: newEmail,
      });

      if (response.success) {
        setSuccess(true);
        // Update the auth store with new email
        if (authUser) {
          setAuthToken(response.token);
          updateAuthUser({ email: newEmail });
        }
      } else {
        setError(response.message || "Failed to verify code");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Handle resending verification code
  const handleResendCode = async () => {
    if (resendCooldown > 0) return;

    setResendLoading(true);
    setError(null);

    try {
      const response = await trpcClient.user.resendEmailVerification.mutate({
        newEmail: newEmail,
      });

      if (response.success) {
        // Update expiration time with the new one
        setExpiresAt(new Date(response.expiresAt));
        // Set cooldown for 60 seconds
        setResendCooldown(60);
      } else {
        setError(response.message || "Failed to resend verification code");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
      
      // Extract retry timestamp from error if available
      extractWaitTimeFromError(err);
    } finally {
      setResendLoading(false);
    }
  };

  // Reset the dialog state when closing
  const handleCloseDialog = () => {
    // Clear timer if it exists
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Wait a bit to avoid seeing the reset while the dialog closes
    setTimeout(() => {
      setStep("enter_email");
      setLoading(false);
      setSuccess(false);
      setError(null);
      setNewEmail("");
      setExpiresAt(null);
      setRemainingTime(null);
      setResendCooldown(0); // Clear any active cooldown
      setRetryAfterTimestamp(null);
      resetInitiateForm();
      confirmForm.reset();
    }, 200);
    onClose();
  };

  // Render the error section with dynamic countdown if it's a rate limit error
  const renderError = () => {
    // Check if the error is a rate limit error with cooldown
    const isRateLimitError = error?.includes("wait") && resendCooldown > 0;
    
    if (!error) return null;
    
    return (
      <div className="p-3 mb-5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5">
        <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
        {isRateLimitError ? (
          <p className="text-sm text-red-600">
            Please wait {resendCooldown} seconds before requesting a new verification code
          </p>
        ) : (
          <p className="text-sm text-red-600">{error}</p>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-change-dialog-title"
    >
      <div className="bg-white rounded-xl p-6 sm:p-8 w-full max-w-md mx-auto shadow-xl animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between mb-6">
          <h2 id="email-change-dialog-title" className="text-xl font-semibold text-gray-900">
            Change Email Address
          </h2>
          <button
            onClick={handleCloseDialog}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close email change dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Display error message if any */}
        {renderError()}

        {/* Success message */}
        {success ? (
          <div className="text-center py-4">
            <div className="flex flex-col items-center mb-5">
              <div className="bg-green-100 rounded-full p-3 mb-4">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-800">Email Address Updated</h3>
            </div>

            <p className="text-sm text-gray-600 mb-6">
              Your email address has been successfully updated to{" "}
              <span className="font-medium">{newEmail}</span>.
            </p>

            <button
              onClick={handleCloseDialog}
              className="px-5 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
            >
              Done
            </button>
          </div>
        ) : step === "enter_email" ? (
          // Step 1: Enter new email form
          <form onSubmit={handleSubmitInitiate(onSubmitInitiateEmail)} className="space-y-5">
            <div>
              <p className="text-sm text-gray-600 mb-5">
                Enter your new email address below. We'll send a verification code to confirm the
                change.
              </p>

              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Current Email
              </label>
              <div className="px-3.5 py-2.5 border border-gray-200 bg-gray-50 rounded-lg mb-4">
                <p className="text-gray-700">{authUser?.email}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">New Email Address</label>
              <input
                type="email"
                className={`w-full px-3.5 py-2.5 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  initiateErrors.newEmail ? "border-red-500" : "border-gray-300"
                }`}
                placeholder="Enter your new email address"
                {...registerInitiate("newEmail")}
              />
              {initiateErrors.newEmail && (
                <p className="mt-1.5 text-sm text-red-600">{initiateErrors.newEmail.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Confirm Email Address
              </label>
              <input
                type="email"
                className={`w-full px-3.5 py-2.5 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  initiateErrors.confirmEmail ? "border-red-500" : "border-gray-300"
                }`}
                placeholder="Confirm your new email address"
                {...registerInitiate("confirmEmail")}
              />
              {initiateErrors.confirmEmail && (
                <p className="mt-1.5 text-sm text-red-600">{initiateErrors.confirmEmail.message}</p>
              )}
            </div>

            <div className="flex justify-end space-x-3 pt-3">
              <button
                type="button"
                onClick={handleCloseDialog}
                className="px-4 py-2.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || resendCooldown > 0}
                className="px-4 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[140px] font-medium"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : resendCooldown > 0 ? (
                  <>
                    Wait {resendCooldown}s
                  </>
                ) : (
                  "Send Verification Code"
                )}
              </button>
            </div>
          </form>
        ) : (
          // Step 2: Verify code form - Updated with Form components
          <div className="space-y-5">
            <p className="text-sm text-gray-600 mb-5">
              We've sent a verification code to <span className="font-medium">{newEmail}</span>.
              Enter the 6-digit code below to verify your new email address.
            </p>

            {expiresAt && remainingTime && (
              <div className="text-sm text-gray-500 text-center mb-3">
                Code expires in: <span className="font-medium">{remainingTime}</span>
              </div>
            )}

            <Form {...confirmForm}>
              <form onSubmit={confirmForm.handleSubmit(onSubmitConfirmEmail)} className="space-y-5">
                <FormField
                  control={confirmForm.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="block text-sm font-medium text-gray-700 text-center mb-2">
                        Verification Code
                      </FormLabel>
                      <div className="flex justify-center">
                        <FormControl>
                          <InputOTP maxLength={6} {...field}>
                            <InputOTPGroup>
                              <InputOTPSlot index={0} className="w-10 h-12" />
                              <InputOTPSlot index={1} className="w-10 h-12" />
                              <InputOTPSlot index={2} className="w-10 h-12" />
                            </InputOTPGroup>
                            <InputOTPSeparator />
                            <InputOTPGroup>
                              <InputOTPSlot index={3} className="w-10 h-12" />
                              <InputOTPSlot index={4} className="w-10 h-12" />
                              <InputOTPSlot index={5} className="w-10 h-12" />
                            </InputOTPGroup>
                          </InputOTP>
                        </FormControl>
                      </div>
                      <FormMessage className="mt-2 text-sm text-red-600 text-center" />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={handleCloseDialog}
                    className="px-4 py-2.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[120px] font-medium"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      "Verify Email"
                    )}
                  </button>
                </div>

                {/* Options row */}
                <div className="flex justify-center items-center pt-4 border-t border-gray-100 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStep("enter_email");
                      confirmForm.reset();
                    }}
                    className="text-sm text-blue-600 hover:text-blue-800 hover:underline mr-6"
                  >
                    Change email address
                  </button>

                  {/* Resend code section */}
                  {resendCooldown > 0 ? (
                    <p className="text-sm text-gray-500">Resend in {resendCooldown}s</p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendCode}
                      className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center"
                      disabled={resendLoading}
                    >
                      {resendLoading ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                          Resending...
                        </>
                      ) : (
                        "Resend code"
                      )}
                    </button>
                  )}
                </div>
              </form>
            </Form>
          </div>
        )}
      </div>
    </div>
  );
}
