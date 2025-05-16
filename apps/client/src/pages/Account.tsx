import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { ArrowLeft, Loader2, Check, X, AlertCircle } from "lucide-react";
import { z } from "zod";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { trpcClient } from "@/utils/trpc";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";

// Define validation schemas using Zod
const initiateEmailSchema = z.object({
  newEmail: z.string().email({ message: "Please enter a valid email address" }),
});

const confirmEmailSchema = z.object({
  code: z.string().length(6, { message: "Verification code must be 6 digits" }),
});

type InitiateEmailFormData = z.infer<typeof initiateEmailSchema>;
type ConfirmEmailFormData = z.infer<typeof confirmEmailSchema>;

export function Account() {
  const { authUser, updateAuthUser } = useAuthStore();
  const [step, setStep] = useState<"idle" | "verification">("idle");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);

  // Form for initiating email change
  const {
    register: registerInitiate,
    handleSubmit: handleSubmitInitiate,
    formState: { errors: initiateErrors },
  } = useForm<InitiateEmailFormData>({
    resolver: zodResolver(initiateEmailSchema),
  });

  // Form for confirming email change
  const {
    register: registerConfirm,
    handleSubmit: handleSubmitConfirm,
    formState: { errors: confirmErrors },
    control,
  } = useForm<ConfirmEmailFormData>({
    resolver: zodResolver(confirmEmailSchema),
    defaultValues: {
      code: "",
    },
  });

  // Calculate remaining time for verification code
  const getRemainingTime = () => {
    if (!expiresAt) return null;
    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();
    if (diff <= 0) return "Expired";
    
    const minutes = Math.floor(diff / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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

  // Reset the form to initial state
  const handleReset = () => {
    setStep("idle");
    setLoading(false);
    setSuccess(false);
    setError(null);
    setNewEmail("");
    setExpiresAt(null);
  };

  if (!authUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50">
        <div className="text-xl font-bold text-gray-800">Please Login</div>
        <p className="text-gray-600 mt-2">
          You need to be logged in to view your account information.
        </p>
        <Link to="/" className="mt-6 text-blue-600 hover:underline">
          Return to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="h-16 border-b bg-white px-6 flex items-center justify-between shrink-0 shadow-sm z-[10]">
        <div className="flex items-center">
          <Link to="/" className="flex items-center text-gray-700 hover:text-gray-900 mr-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            <span className="font-medium">Back to Editor</span>
          </Link>
          <h1 className="text-lg font-semibold">My Account</h1>
        </div>
      </div>

      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-800 mb-4">Profile Details</h2>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Email</p>
              <div className="flex items-center mt-1">
                <p className="text-base font-medium text-gray-900">{authUser.email}</p>
                {step === "idle" && !success && (
                  <button
                    onClick={() => setStep("verification")}
                    className="ml-3 text-sm text-blue-600 hover:text-blue-800"
                  >
                    Change
                  </button>
                )}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-500">Account ID</p>
              <p className="mt-1 text-base font-medium text-gray-900">{authUser.id}</p>
            </div>
          </div>
        </div>

        {/* Email Change Section */}
        {step === "verification" && !success && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-medium text-gray-800 mb-4">Change Email Address</h2>
            
            {/* Display error message if any */}
            {error && (
              <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Step 1: Enter new email */}
            {!newEmail && (
              <form onSubmit={handleSubmitInitiate(onSubmitInitiateEmail)} className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">
                    New Email Address
                  </label>
                  <input
                    type="email"
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      initiateErrors.newEmail ? "border-red-500" : "border-gray-300"
                    }`}
                    placeholder="Enter your new email address"
                    {...registerInitiate("newEmail")}
                  />
                  {initiateErrors.newEmail && (
                    <p className="mt-1 text-sm text-red-600">{initiateErrors.newEmail.message}</p>
                  )}
                </div>
                
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Send Verification Code'
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Step 2: Verify code */}
            {newEmail && (
              <form onSubmit={handleSubmitConfirm(onSubmitConfirmEmail)} className="space-y-4">
                <p className="text-sm text-gray-600 mb-4">
                  We've sent a verification code to <span className="font-medium">{newEmail}</span>.
                  Enter the 6-digit code below to verify your new email address.
                </p>
                
                {expiresAt && (
                  <div className="text-sm text-gray-500">
                    Code expires in: {getRemainingTime()}
                  </div>
                )}
                
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Verification Code
                  </label>
                  <Controller
                    name="code"
                    control={control}
                    render={({ field }) => (
                      <InputOTP 
                        maxLength={6} 
                        value={field.value} 
                        onChange={field.onChange}
                        className={confirmErrors.code ? "border-red-500" : ""}
                      >
                        <InputOTPGroup>
                          <InputOTPSlot index={0} />
                          <InputOTPSlot index={1} />
                          <InputOTPSlot index={2} />
                        </InputOTPGroup>
                        <InputOTPSeparator />
                        <InputOTPGroup>
                          <InputOTPSlot index={3} />
                          <InputOTPSlot index={4} />
                          <InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP>
                    )}
                  />
                  {confirmErrors.code && (
                    <p className="mt-1 text-sm text-red-600">{confirmErrors.code.message}</p>
                  )}
                </div>
                
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      'Verify Email'
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Success message */}
        {success && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center mb-4">
              <div className="bg-green-100 rounded-full p-2 mr-3">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <h2 className="text-lg font-medium text-gray-800">Email Address Updated</h2>
            </div>
            
            <p className="text-sm text-gray-600 mb-4">
              Your email address has been successfully updated to <span className="font-medium">{newEmail}</span>.
            </p>
            
            <button
              onClick={handleReset}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
