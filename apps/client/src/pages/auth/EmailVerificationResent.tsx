import { useState, useEffect } from "react";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader } from "lucide-react";
import { AuthHeader } from "../../components/auth/AuthHeader";
import { trpc } from "@/utils/trpc";

// Define the validation schema using Zod
const emailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

// Infer the type from the schema
type EmailFormData = z.infer<typeof emailSchema>;

export function EmailVerificationResent() {
  const [status, setStatus] = useState<"loading" | "success" | "error" | "form">("loading");
  const [message, setMessage] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const emailParam = queryParams.get("email") || "";
  const statusParam = queryParams.get("status");
  const errorParam = queryParams.get("error");

  // Initialize react-hook-form with zod resolver
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<EmailFormData>({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      email: emailParam,
    },
  });

  useEffect(() => {
    // If email is not provided, show form instead of automatically sending
    if (!emailParam) {
      setStatus("form");
      return;
    }

    // Set email value in form if provided
    setValue("email", emailParam);

    // If status or error info is passed in URL params, use that
    if (statusParam === "success") {
      setStatus("success");
      return;
    } else if (errorParam) {
      setStatus("error");
      switch (errorParam) {
        case "userNotFound":
          setMessage("User not found");
          break;
        case "emailMissing":
          setMessage("Email address is required");
          break;
        case "tokenGenerationFailed":
          setMessage("Failed to generate verification token");
          break;
        case "emailSendFailed":
          setMessage("Failed to send verification email");
          break;
        case "serverError":
          setMessage("Server error occurred");
          break;
        default:
          setMessage("An error occurred");
      }
      return;
    }

    // Use the API function to resend verification email
    trpc.auth.sendVerifyEmail
      .mutate({ email: emailParam })
      .then(data => {
        if (data.success) {
          setStatus("success");
          setMessage(data.message || "Verification email has been sent");
        } else {
          setStatus("error");
          setMessage(data.message || "Failed to resend verification email");
        }
      })
      .catch(error => {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "An error occurred");
      });
  }, [emailParam, statusParam, errorParam, setValue]);

  const onSubmit = async (data: EmailFormData) => {
    setStatus("loading");

    try {
      const response = await trpc.auth.sendVerifyEmail.mutate({
        email: data.email,
      });

      if (response.success) {
        setStatus("success");
        setMessage(response.message || "Verification email has been sent");
      } else {
        setStatus("error");
        setMessage(response.message || "Failed to resend verification email");
      }
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "An error occurred");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-4 bg-white rounded-xl shadow-md">
        <AuthHeader title="Email Verification" />

        {status === "loading" && (
          <div className="text-center space-y-3">
            <Loader className="animate-spin h-10 w-10 mx-auto text-primary" />
            <p className="text-gray-600">Sending verification email...</p>
          </div>
        )}

        {status === "form" && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <p className="text-center text-gray-600">
              Enter your email address to receive a verification link:
            </p>
            <div className="form-group space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                className={`w-full px-3 py-2 border rounded-md focus:ring-primary focus:border-primary ${errors.email ? "border-red-500" : "border-gray-300"}`}
                placeholder="Enter your email address"
                {...register("email")}
              />
              {errors.email && <p className="text-sm text-red-500 mt-1">{errors.email.message}</p>}
            </div>

            <button
              type="submit"
              className="w-full px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50 transition-colors"
            >
              Send Verification Email
            </button>

            <div className="text-center pt-2">
              <Link
                to="/"
                className="text-primary hover:text-primary-dark text-sm transition-colors"
              >
                Back to Home
              </Link>
            </div>
          </form>
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
            <h2 className="text-xl font-semibold text-gray-800">Verification Email Sent!</h2>
            <p className="text-gray-600">
              We've sent a verification email to <strong>{emailParam}</strong>.
            </p>
            <p className="text-gray-600">
              Please check your inbox and follow the instructions to verify your email address.
            </p>
            <Link
              to="/"
              className="inline-block mt-4 px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark transition-colors"
            >
              Go to Home
            </Link>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <div className="text-center">
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
              <h2 className="text-xl font-semibold text-gray-800 mt-2">Error</h2>
              <p className="text-gray-600 mt-1">
                {message || "There was a problem sending the verification email."}
              </p>
              <p className="text-gray-600">
                Please make sure the email address is correct and try again.
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
              <div className="form-group space-y-2">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  className={`w-full px-3 py-2 border rounded-md focus:ring-primary focus:border-primary ${errors.email ? "border-red-500" : "border-gray-300"}`}
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-sm text-red-500 mt-1">{errors.email.message}</p>
                )}
              </div>

              <button
                type="submit"
                className="w-full px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50 transition-colors"
              >
                Try Again
              </button>
            </form>

            <div className="text-center pt-2">
              <Link
                to="/"
                className="text-primary hover:text-primary-dark text-sm transition-colors"
              >
                Go to Home
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
