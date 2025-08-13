import { useState } from "react";
import { AlertTriangle, Mail } from "lucide-react";
import { trpcClient } from "@/utils/trpc";
import { useAuth } from "@/contexts/AuthContext";

const EmailVerificationBanner = () => {
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const { authUser } = useAuth();

  if (authUser === null) {
    return null;
  }

  const handleResendEmail = () => {
    setIsResending(true);

    return trpcClient.user.resendEmailVerification.mutate({ newEmail: authUser.email }).then(
      () => {
        setIsResending(false);
        setResendSuccess(true);
      },
      () => {
        setIsResending(false);
        setResendSuccess(false);
      }
    );
  };

  return (
    <div className=" bg-amber-50 border-l-4 border-amber-400 p-1 rounded shadow-sm">
      <div className="flex items-center gap-1">
        <div className="flex-shrink-0 mt-0.5">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
        </div>

        <div className="mt-1">
          <p className="text-sm text-amber-700">
            Please verify your email address to unlock all features of your account.
          </p>
        </div>

        <div className="mt-1">
          <button
            onClick={handleResendEmail}
            disabled={isResending}
            className="inline-flex items-center px-3 py-1.5 border border-amber-600 text-xs font-medium rounded text-amber-700 bg-white hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition-colors"
          >
            {isResending ? (
              <>
                <svg
                  className="animate-spin -ml-0.5 mr-2 h-3 w-3 text-amber-600"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Sending...
              </>
            ) : (
              <>
                <Mail className="h-3 w-3 mr-1.5" />
                {resendSuccess ? "Verification email sent!" : "Resend verification email"}
              </>
            )}
          </button>
        </div>
        {/* </div> */}
      </div>
    </div>
  );
};

export default EmailVerificationBanner;
