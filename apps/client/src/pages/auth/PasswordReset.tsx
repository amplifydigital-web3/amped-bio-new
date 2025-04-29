import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { processPasswordReset } from "../../api/api";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader } from "lucide-react";
import type { PasswordResetResponse } from "../../api/api.types";
import { AuthHeader } from "../../components/auth/AuthHeader";

// Define the validation schema using Zod
const passwordResetSchema = z
  .object({
    token: z.string().min(1, "Token is required"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters long")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    confirmPassword: z.string(),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

// Infer the type from the schema
type PasswordResetFormData = z.infer<typeof passwordResetSchema>;

export function PasswordReset() {
  const { token: urlToken } = useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState<"valid" | "submitting" | "success" | "error">("valid");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Initialize react-hook-form with zod resolver
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<PasswordResetFormData>({
    resolver: zodResolver(passwordResetSchema),
    defaultValues: {
      token: urlToken || "",
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    // If URL has a token, set it in the form
    if (urlToken) {
      setValue("token", urlToken);
    }
  }, [urlToken, setValue]);

  const onSubmit = async (data: PasswordResetFormData) => {
    setStatus("submitting");
    setIsLoading(true);

    try {
      const response: PasswordResetResponse = await processPasswordReset(data.token, data.password);

      if (response.success) {
        setStatus("success");
        setMessage(response.message || "Password has been successfully reset.");
      } else {
        setStatus("error");
        setMessage(response.message || "Failed to reset password");
      }
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "An unexpected error occurred. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-4 bg-white rounded-xl shadow-md">
        <AuthHeader title="Reset Your Password" />

        {status === "success" ? (
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
            <h2 className="text-xl font-semibold text-gray-800">Password Reset Successful!</h2>
            <p className="text-gray-600">{message}</p>
            <button
              onClick={() => navigate("/")}
              className="w-full px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50 transition-colors"
            >
              Go to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="form-group space-y-2">
              <label htmlFor="token" className="block text-sm font-medium text-gray-700">
                Reset Token
              </label>
              <input
                type="text"
                id="token"
                className={`w-full px-3 py-2 border rounded-md focus:ring-primary focus:border-primary ${errors.token ? "border-red-500" : "border-gray-300"}`}
                placeholder="Enter your reset token"
                {...register("token")}
              />
              {errors.token && <p className="text-sm text-red-500 mt-1">{errors.token.message}</p>}
            </div>

            <div className="form-group space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                New Password
              </label>
              <input
                type="password"
                id="password"
                className={`w-full px-3 py-2 border rounded-md focus:ring-primary focus:border-primary ${errors.password ? "border-red-500" : "border-gray-300"}`}
                placeholder="Enter new password"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-sm text-red-500 mt-1">{errors.password.message}</p>
              )}
            </div>

            <div className="form-group space-y-2">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                className={`w-full px-3 py-2 border rounded-md focus:ring-primary focus:border-primary ${errors.confirmPassword ? "border-red-500" : "border-gray-300"}`}
                placeholder="Confirm new password"
                {...register("confirmPassword")}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-red-500 mt-1">{errors.confirmPassword.message}</p>
              )}
            </div>

            {status === "error" && message && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{message}</p>
              </div>
            )}

            <button
              type="submit"
              className="w-full px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50 transition-colors"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <Loader className="inline mr-2 w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </div>
              ) : (
                "Reset Password"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
