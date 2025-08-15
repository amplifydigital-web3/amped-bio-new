import { useEffect, useState } from "react";
import { useParams, useLocation, Link, useNavigate } from "react-router-dom";
import { Loader } from "lucide-react";
import { AuthHeader } from "../../components/auth/AuthHeader";
import { trpcClient } from "@/utils/trpc";

export function EmailVerification() {
  const { token } = useParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [onelink, setOnelink] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const email = queryParams.get("email") || "";
  const statusParam = queryParams.get("status");
  const errorParam = queryParams.get("error");

  useEffect(() => {
    // If status or error info is passed in URL params, use that
    if (statusParam === "success") {
      setStatus("success");
      const onelinkParam = queryParams.get("onelink");
      if (onelinkParam) setOnelink(onelinkParam);
      return;
    } else if (errorParam) {
      setStatus("error");
      setMessage(
        errorParam === "invalidToken"
          ? "(Token, Email) not found"
          : errorParam === "emailMissing"
            ? "Email address is missing"
            : "Verification failed"
      );
      return;
    }

    // Otherwise, make the API call
    if (!token || !email) {
      setStatus("error");
      setMessage("Missing token or email");
      return;
    }

    // Use the API function to verify the email
    trpcClient.auth.verifyEmail
      .mutate({ token, email })
      .then(data => {
        setStatus("success");
        if (data.onelink) setOnelink(data.onelink);
      })
      .catch(error => {
        setStatus("error");
        setMessage(
          error instanceof Error ? error.message : "An error occurred during verification"
        );
      });
  }, [token, email, statusParam, errorParam, queryParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-4 bg-white rounded-xl shadow-md">
        <AuthHeader title="Email Verification" />

        {status === "loading" && (
          <div className="text-center space-y-3">
            <Loader className="animate-spin h-10 w-10 mx-auto text-primary" />
            <p className="text-gray-600">Verifying your email...</p>
          </div>
        )}

        {status === "success" && (
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100">
              <svg
                className="w-8 h-8 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800">Email Verified Successfully!</h2>
            <p className="text-gray-600">
              Your email has been verified. You can now access all features of your account.
            </p>
            {onelink ? (
              <Link
                to={`/${onelink}`}
                className="inline-block mt-4 px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark transition-colors"
              >
                Go to Your Profile
              </Link>
            ) : (
              <Link
                to="/"
                className="inline-block mt-4 px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark transition-colors"
              >
                Go to Home
              </Link>
            )}
          </div>
        )}

        {status === "error" && (
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100">
              <svg
                className="w-8 h-8 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800">Verification Failed</h2>
            <p className="text-gray-600">
              {message || "There was a problem verifying your email."}
            </p>
            <p className="text-gray-600">Please try again or request a new verification link.</p>
            <Link
              to={`/auth/resend-verification?email=${encodeURIComponent(email)}`}
              className="inline-block mt-4 px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark transition-colors"
            >
              Resend Verification Email
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
