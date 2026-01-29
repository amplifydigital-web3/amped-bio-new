import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader, Check, X, Eye, EyeOff } from "lucide-react";
import { AuthHeader } from "../../components/auth/AuthHeader";
import { authClient } from "../../lib/auth-client";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../../components/ui/form";
import { Input } from "../../components/ui/Input";

// Password strength indicator component
const PasswordStrengthIndicator = ({ password }: { password: string }) => {
  const hasMinLength = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  const criteriaList = [
    { label: "At least 8 characters", met: hasMinLength },
    { label: "At least one uppercase letter", met: hasUpperCase },
    { label: "At least one lowercase letter", met: hasLowerCase },
    { label: "At least one number", met: hasNumber },
  ];

  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs font-medium text-gray-500">Password requirements:</p>
      <div className="grid grid-cols-1 gap-1">
        {criteriaList.map((criteria, index) => (
          <div key={index} className="flex items-center text-xs">
            {criteria.met ? (
              <Check className="w-3 h-3 mr-1.5 text-green-500" />
            ) : (
              <X className="w-3 h-3 mr-1.5 text-gray-400" />
            )}
            <span className={criteria.met ? "text-green-700" : "text-gray-500"}>
              {criteria.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

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
  const [showPasswords, setShowPasswords] = useState(false);

  const form = useForm<PasswordResetFormData>({
    resolver: zodResolver(passwordResetSchema),
    defaultValues: {
      token: urlToken || "",
      password: "",
      confirmPassword: "",
    },
    mode: "onChange",
  });

  useEffect(() => {
    if (urlToken) {
      form.setValue("token", urlToken);
    }
  }, [urlToken, form]);

  const handleSubmit = async () => {
    const isValid = await form.trigger();

    if (!isValid) {
      return;
    }

    const data = form.getValues();

    setStatus("submitting");
    setIsLoading(true);

    try {
      const response = await authClient.resetPassword({
        newPassword: data.password,
        token: data.token,
      });

      if (response.error) {
        setStatus("error");
        setMessage(response.error.message || "Failed to reset password.");
      } else {
        setStatus("success");
        setMessage("Password has been successfully reset.");
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

  const password = form.watch("password");
  const confirmPassword = form.watch("confirmPassword");
  const token = form.watch("token");

  const hasMinLength = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordsMatch = password === confirmPassword && confirmPassword !== "";

  const passwordMeetsRequirements = hasMinLength && hasUpperCase && hasLowerCase && hasNumber;

  const isFormValid = passwordMeetsRequirements && passwordsMatch && token.length > 0;

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
          <Form {...form}>
            <form
              onSubmit={e => {
                e.preventDefault();
                handleSubmit();
              }}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="token"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reset Token</FormLabel>
                    <FormControl>
                      <Input type="text" placeholder="Enter your reset token" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2 relative">
                <button
                  type="button"
                  className="absolute right-3 top-9 text-gray-500 hover:text-gray-700 z-10"
                  onClick={() => setShowPasswords(!showPasswords)}
                  aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
                >
                  {showPasswords ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input
                          type={showPasswords ? "text" : "password"}
                          placeholder="Enter new password"
                          {...field}
                        />
                      </FormControl>
                      <PasswordStrengthIndicator password={password} />
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input
                          type={showPasswords ? "text" : "password"}
                          placeholder="Confirm new password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {status === "error" && message && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-600">{message}</p>
                </div>
              )}

              <button
                type="submit"
                className="w-full px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isLoading || !isFormValid}
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
          </Form>
        )}
      </div>
    </div>
  );
}
