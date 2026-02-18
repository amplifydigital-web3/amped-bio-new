import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Eye, EyeOff, Check, X as XIcon, AlertCircle, Gift } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import type { AuthUser } from "../../types/auth";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useLocation } from "react-router";
import { useHandleAvailability } from "@/hooks/useHandleAvailability";
import { URLStatusIndicator } from "@/components/ui/URLStatusIndicator";
import { GoogleLoginButton } from "./GoogleLoginButton";
import { useCaptcha } from "@/hooks/useCaptcha";
import { useReferralHandler } from "@/hooks/useReferralHandler";
import { CaptchaActions } from "@ampedbio/constants";
import { authClient } from "@/lib/auth-client";
import { normalizeHandle, cleanHandleInput, getHandlePublicUrl } from "@/utils/handle";
import { trackGAEvent, trackTwitterEvent, loadTwitterPixel } from "@/utils/ga";
import { trpc } from "@/utils/trpc/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Extended user type for better-auth session
interface BetterAuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
  handle: string;
  role: string;
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: (user: AuthUser) => void;
  onCancel: () => void;
  initialForm?: FormType;
}

// Define validation schemas using Zod
const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters long"),
});

const registerSchema = z.object({
  handle: z
    .string()
    .min(3, "Handle must be at least 3 characters")
    .regex(
      /^[a-z0-9_-]+$/,
      "Handle can only contain lowercase letters, numbers, underscores and hyphens"
    ),
  email: z.string().email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

const resetSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

// Create union type for all form types
type FormType = "login" | "register" | "reset";

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
              <XIcon className="w-3 h-3 mr-1.5 text-gray-400" />
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

export function AuthModal({ isOpen, onClose, onCancel, initialForm = "login" }: AuthModalProps) {
  const { resetPassword } = useAuth();
  const { executeCaptcha } = useCaptcha();
  const { getReferrerId, clearReferrerId } = useReferralHandler();
  const [loading, setLoading] = useState(false);
  const [sharedEmail, setSharedEmail] = useState("");
  const isUserTyping = useRef(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const getInitialForm = (): FormType => {
    if (location.pathname === "/register") {
      return "register";
    } else if (location.pathname === "/login") {
      return "login";
    } else if (location.pathname === "/reset-password") {
      return "reset";
    }
    return initialForm;
  };

  const [form, setForm] = useState<FormType>(getInitialForm());

  // Add error states for each form
  const [loginError, setLoginError] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  // Add success state for reset password form
  const [resetSuccess, setResetSuccess] = useState(false);

  const [handleInput, setHandleInput] = useState("");
  const { urlStatus, isValid } = useHandleAvailability(handleInput);

  // Fetch referrer info if user was referred
  const referrerId = getReferrerId();
  const { data: referrerInfo } = useQuery({
    ...trpc.referral.getReferrerInfo.queryOptions({ userId: referrerId! }),
    enabled: !!referrerId,
    retry: false,
  });

  // Handle handle input changes with proper cleaning
  const handleHandleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleanValue = cleanHandleInput(e.target.value);
    setHandleInput(cleanValue);
    setRegisterValue("handle", cleanValue);
    e.target.value = cleanValue;
  };

  // Use react-hook-form with zod resolver based on current form type
  const {
    register: registerLogin,
    handleSubmit: handleSubmitLogin,
    formState: { errors: loginErrors },
    setValue: setLoginValue,
    watch: watchLogin,
  } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    mode: "onBlur",
    defaultValues: {
      email: sharedEmail,
    },
  });

  const {
    register: registerSignUp,
    handleSubmit: handleSubmitSignUp,
    formState: { errors: registerErrors },
    setValue: setRegisterValue,
    watch: watchRegister,
  } = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    mode: "onBlur",
    defaultValues: {
      email: sharedEmail,
    },
  });

  const {
    register: registerReset,
    handleSubmit: handleSubmitReset,
    formState: { errors: resetErrors },
    setValue: setResetValue,
    watch: watchReset,
  } = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    mode: "onBlur",
    defaultValues: {
      email: sharedEmail,
    },
  });

  // Extract watch calls outside of useEffect
  const loginEmail = watchLogin("email");
  const registerEmail = watchRegister("email");
  const resetEmail = watchReset("email");
  const registerHandle = watchRegister("handle");
  const registerPassword = watchRegister("password");

  // Use a single useEffect to handle all email synchronization
  useEffect(() => {
    // Determine the current active form's email
    const currentEmail =
      form === "login" ? loginEmail : form === "register" ? registerEmail : resetEmail;

    // Only update shared email when user is actively typing
    if (currentEmail !== sharedEmail && currentEmail !== undefined) {
      setSharedEmail(currentEmail);
      isUserTyping.current = true;
    }
  }, [loginEmail, registerEmail, resetEmail, form, sharedEmail]);

  // Update other forms only when shared email changes and not from user typing
  useEffect(() => {
    if (!isUserTyping.current) {
      setLoginValue("email", sharedEmail);
      setRegisterValue("email", sharedEmail);
      setResetValue("email", sharedEmail);
    }
    isUserTyping.current = false;
  }, [setLoginValue, setRegisterValue, setResetValue, sharedEmail]);

  // Check handle availability when it changes
  useEffect(() => {
    if (registerHandle) {
      const normalizedHandle = normalizeHandle(registerHandle);
      setHandleInput(normalizedHandle);
    }
  }, [registerHandle]);

  // Load Twitter Pixel only on register path
  useEffect(() => {
    if (location.pathname === "/register") {
      loadTwitterPixel("tw-r4zrx");
    }
  }, [location.pathname]);

  // Custom form switcher that maintains email and clears errors
  const switchForm = (newForm: FormType) => {
    setLoginError(null);
    setRegisterError(null);
    setResetError(null);
    setResetSuccess(false);
    setForm(newForm);

    // Ensure email is set in the new form based on sharedEmail
    const currentEmail =
      newForm === "login" ? loginEmail : newForm === "register" ? registerEmail : resetEmail;
    if (sharedEmail && currentEmail !== sharedEmail) {
      if (newForm === "login") {
        setLoginValue("email", sharedEmail);
      } else if (newForm === "register") {
        setRegisterValue("email", sharedEmail);
      } else if (newForm === "reset") {
        setResetValue("email", sharedEmail);
      }
    }

    // Update URL based on the new form type
    if (newForm === "login") {
      window.history.replaceState(null, "", "/login");
    } else if (newForm === "register") {
      window.history.replaceState(null, "", "/register");
    } else if (newForm === "reset") {
      window.history.replaceState(null, "", "/reset-password");
    }
  };

  // Handle login form submission
  const onSubmitLogin = async (data: z.infer<typeof loginSchema>) => {
    setLoading(true);
    setLoginError(null);
    try {
      // Get reCAPTCHA token using the invisible captcha
      const recaptchaToken = await executeCaptcha(CaptchaActions.LOGIN);

      // Using better-auth for email/password login
      const response = await authClient.signIn.email({
        email: data.email,
        password: data.password,
        callbackURL: window.location.href,
        rememberMe: true,
        fetchOptions: {
          headers: recaptchaToken
            ? {
                "x-captcha-response": recaptchaToken!,
              }
            : undefined,
        },
      });

      if (response?.error) {
        throw new Error(response.error.message || "Login failed");
      }

      const user = response.data.user as BetterAuthUser;

      onClose({
        id: parseInt(user.id),
        email: user.email,
        handle: user.handle,
        role: user.role,
        image: user.image || null,
        wallet: null,
      });
    } catch (error) {
      setLoginError((error as Error).message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setLoginError(null);

    try {
      const referrerId = getReferrerId();

      const response = await authClient.signIn.social({
        provider: "google",
        callbackURL: window.location.href,
        fetchOptions: {
          query: referrerId ? { referrerId } : undefined,
        },
      });

      if (response?.error) {
        setLoading(false);
        setLoginError(response.error.message || "Google login failed");
        return;
      }
    } catch (error) {
      setLoginError((error as Error).message || "Google login failed");
      setLoading(false);
    }
  };

  const renderSignInWithGoogle = () => {
    return (
      <>
        {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
          <>
            <div className="relative flex items-center my-4">
              <div className="flex-grow border-t border-gray-300"></div>
              <span className="flex-shrink mx-4 text-gray-600 text-sm">or</span>
              <div className="flex-grow border-t border-gray-300"></div>
            </div>

            <div data-testid="google-sign-in" className="w-full">
              <GoogleLoginButton onClick={() => handleGoogleLogin()} />
            </div>
          </>
        )}
      </>
    );
  };

  // Handle register form submission
  const onSubmitRegister = async (data: z.infer<typeof registerSchema>) => {
    setLoading(true);
    setRegisterError(null);
    try {
      const recaptchaToken = await executeCaptcha(CaptchaActions.REGISTER);
      const referrerId = getReferrerId();

      const response = await authClient.signUp.email({
        email: data.email,
        password: data.password,
        name: data.handle,
        handle: data.handle,
        callbackURL: window.location.href,
        fetchOptions: {
          query: referrerId ? { referrerId } : undefined,
          headers: recaptchaToken
            ? {
                "x-captcha-response": recaptchaToken!,
              }
            : undefined,
        },
      });

      if (response?.error) {
        throw new Error(response.error.message || "Registration failed");
      }

      // Track Twitter signup conversion
      trackTwitterEvent("tw-r4zrx-r4zss");

      if (referrerId) {
        clearReferrerId();
      }

      const user = response.data.user as BetterAuthUser;

      onClose({
        id: parseInt(user.id),
        email: user.email,
        handle: user.handle,
        role: user.role,
        image: user.image || null,
        wallet: null,
      });
    } catch (error) {
      setRegisterError((error as Error).message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  // Handle password reset form submission
  const onSubmitReset = async (data: z.infer<typeof resetSchema>) => {
    setLoading(true);
    setResetError(null);
    setResetSuccess(false);

    try {
      // Get reCAPTCHA token using the invisible captcha
      const recaptchaToken = await executeCaptcha(CaptchaActions.RESET_PASSWORD);
      const response = await resetPassword(data.email, recaptchaToken);
      if (response.success) {
        setResetSuccess(true);
      } else {
        setResetError(response.message || "Failed to reset password");
      }
    } catch (error) {
      setResetError((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={open => {
        if (!open) {
          onCancel();
          trackGAEvent("Click", "AuthModal", "CloseModalButton");
        }
      }}
    >
      <DialogContent className="p-0 w-full max-w-md mx-4">
        <DialogHeader className="p-6 pb-4 border-b border-gray-200">
          <DialogTitle className="text-xl font-semibold">
            {form === "register" && "Sign Up for Free"}
            {form === "login" && "Sign In"}
            {form === "reset" && "Reset Password"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {form === "register" && "Sign up form for creating a new account"}
            {form === "login" && "Sign in form for existing users"}
            {form === "reset" && "Password reset form to recover your account"}
          </DialogDescription>
        </DialogHeader>
        <div className="p-6">
          {form === "login" && (
            <form
              onSubmit={handleSubmitLogin(onSubmitLogin)}
              className="space-y-4"
              data-testid="login-form"
            >
              {loginError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-600">{loginError}</p>
                </div>
              )}
              <Input
                label="Email"
                type="email"
                error={loginErrors.email?.message}
                required
                aria-label="Email"
                data-testid="login-email"
                autoComplete="email"
                {...registerLogin("email")}
                onBlur={e => {
                  registerLogin("email").onBlur(e);
                  trackGAEvent("Input", "AuthModal", "LoginEmailInput");
                }}
              />
              <div className="relative">
                <Input
                  label="Password"
                  type={showLoginPassword ? "text" : "password"}
                  error={loginErrors.password?.message}
                  required
                  aria-label="Password"
                  data-testid="login-password"
                  autoComplete="current-password"
                  {...registerLogin("password")}
                  onBlur={e => {
                    registerLogin("password").onBlur(e);
                    trackGAEvent("Input", "AuthModal", "LoginPasswordInput");
                  }}
                />
                <button
                  type="button"
                  className="absolute right-3 top-9 text-gray-500 hover:text-gray-700"
                  onClick={() => {
                    setShowLoginPassword(!showLoginPassword);
                    trackGAEvent("Click", "AuthModal", "LoginTogglePasswordButton");
                  }}
                  aria-label={showLoginPassword ? "Hide password" : "Show password"}
                  data-testid="login-toggle-password"
                >
                  {showLoginPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <Button
                type="submit"
                className="w-full relative"
                disabled={loading}
                aria-disabled={loading}
                aria-label="Sign In"
                data-testid="login-submit"
                onClick={() => {
                  trackGAEvent("Click", "AuthModal", "SignInButton");
                  window.history.replaceState(null, "", "/login");
                }}
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin text-white/80" />
                    Signing In...
                  </span>
                ) : (
                  "Sign In"
                )}
              </Button>

              {renderSignInWithGoogle()}
            </form>
          )}

          {form === "register" && (
            <form
              onSubmit={handleSubmitSignUp(onSubmitRegister)}
              className="space-y-4"
              data-testid="register-form"
            >
              {referrerInfo && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-md flex items-start gap-2">
                  <Gift className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-700">
                      You have been referred by{" "}
                      <a
                        href={`/${referrerInfo.handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        @{referrerInfo.handle}
                      </a>
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      After you sign up, you'll receive{" "}
                      <span className="font-semibold text-purple-600">
                        {referrerInfo.refereeReward} REVO
                      </span>{" "}
                      as a referral bonus!
                    </p>
                  </div>
                </div>
              )}
              {registerError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-600">{registerError}</p>
                </div>
              )}
              <div className="relative">
                <Input
                  label="Claim your handle"
                  leftText="@"
                  error={registerErrors.handle?.message}
                  required
                  aria-label="Claim your handle"
                  data-testid="register-handle"
                  autoComplete="username"
                  placeholder="your-name"
                  {...registerSignUp("handle", {
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                      e.target.value = e.target.value.toLowerCase();
                      registerSignUp("handle").onChange(e);
                      handleHandleChange(e);
                    },
                    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
                      registerSignUp("handle").onBlur(e);
                      trackGAEvent("Input", "AuthModal", "RegisterHandleInput");
                    },
                  })}
                />
                <div className="absolute right-3 top-9">
                  <URLStatusIndicator status={urlStatus} isCurrentUrl={false} compact={true} />
                </div>
              </div>
              {handleInput && (
                <p className="text-sm text-gray-600" data-testid="public-url-preview">
                  Public URL:{" "}
                  <a
                    href={getHandlePublicUrl(handleInput)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700"
                    onClick={() => trackGAEvent("Click", "AuthModal", "PublicURLPreviewLink")}
                  >
                    {getHandlePublicUrl(handleInput)}
                  </a>
                </p>
              )}
              <Input
                label="Email"
                type="email"
                error={registerErrors.email?.message}
                required
                aria-label="Email"
                data-testid="register-email"
                autoComplete="email"
                {...registerSignUp("email")}
                onBlur={e => {
                  registerSignUp("email").onBlur(e);
                  trackGAEvent("Input", "AuthModal", "RegisterEmailInput");
                }}
              />
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    label="Password"
                    type={showRegisterPassword ? "text" : "password"}
                    error={registerErrors.password?.message}
                    required
                    aria-label="Password"
                    data-testid="register-password"
                    autoComplete="new-password"
                    {...registerSignUp("password")}
                    onBlur={e => {
                      registerSignUp("password").onBlur(e);
                      trackGAEvent("Input", "AuthModal", "RegisterPasswordInput");
                    }}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-9 text-gray-500 hover:text-gray-700"
                    onClick={() => {
                      setShowRegisterPassword(!showRegisterPassword);
                      trackGAEvent("Click", "AuthModal", "RegisterTogglePasswordButton");
                    }}
                    aria-label={showRegisterPassword ? "Hide password" : "Show password"}
                    data-testid="register-toggle-password"
                  >
                    {showRegisterPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
                <PasswordStrengthIndicator password={registerPassword || ""} />
              </div>
              <Button
                type="submit"
                className="w-full relative"
                disabled={loading || urlStatus === "Unavailable" || !isValid || !handleInput}
                aria-disabled={loading || urlStatus === "Unavailable" || !isValid || !handleInput}
                aria-label="Create Account"
                data-testid="register-submit"
                onClick={() => trackGAEvent("Click", "AuthModal", "CreateAccountButton")}
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin text-white/80" />
                    Creating Account...
                  </span>
                ) : (
                  "Create Account"
                )}
              </Button>

              {renderSignInWithGoogle()}

              {urlStatus === "Unavailable" && handleInput && (
                <p
                  className="text-xs text-center text-red-600"
                  data-testid="url-unavailable-message"
                >
                  This URL is already taken. Please choose another one.
                </p>
              )}
            </form>
          )}

          {form === "reset" && (
            <form
              onSubmit={handleSubmitReset(onSubmitReset)}
              className="space-y-4"
              data-testid="reset-form"
            >
              {!resetSuccess && (
                <div className="mb-2">
                  <p className="text-sm text-gray-600 mb-4">
                    Enter your email address below and we'll send you instructions to reset your
                    password.
                  </p>
                </div>
              )}
              {resetError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-600">{resetError}</p>
                </div>
              )}
              {resetSuccess ? (
                <div className="p-3 bg-green-50 border border-green-200 rounded-md flex items-start gap-2">
                  <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-green-600">
                    If a user exists with this email, instructions to reset your password have been
                    sent.
                  </p>
                </div>
              ) : (
                <>
                  <Input
                    label="Email"
                    type="email"
                    error={resetErrors.email?.message}
                    required
                    aria-label="Email"
                    data-testid="reset-email"
                    autoComplete="email"
                    {...registerReset("email")}
                    onBlur={e => {
                      registerReset("email").onBlur(e);
                      trackGAEvent("Input", "AuthModal", "ResetEmailInput");
                    }}
                  />
                  <Button
                    type="submit"
                    className="w-full relative"
                    disabled={loading}
                    aria-disabled={loading}
                    aria-label="Send Reset Instructions"
                    data-testid="reset-submit"
                    onClick={() =>
                      trackGAEvent("Click", "AuthModal", "SendResetInstructionsButton")
                    }
                  >
                    {loading ? (
                      <span className="flex items-center justify-center">
                        <Loader2 className="mr-2 h-5 w-5 animate-spin text-white/80" />
                        Sending Email...
                      </span>
                    ) : (
                      "Send Reset Instructions"
                    )}
                  </Button>
                </>
              )}
              {!resetSuccess && (
                <div className="text-center text-sm text-gray-600 mt-4 p-3 border border-gray-200 rounded-md bg-gray-50">
                  <p>Already have a password reset token?</p>
                  <Link
                    to={`/auth/reset-password/?email=${encodeURIComponent(resetEmail)}`}
                    className="inline-block mt-2 text-blue-600 hover:text-blue-700 hover:underline font-medium"
                    aria-label="Use reset token"
                    data-testid="use-reset-token"
                    onClick={() => trackGAEvent("Click", "AuthModal", "UseResetTokenLink")}
                  >
                    Use your reset token here →
                  </Link>
                </div>
              )}
            </form>
          )}

          <p className="text-center text-sm text-gray-600 mt-2">
            {form !== "login" && (
              <>
                {"Already have an account?"}
                <button
                  type="button"
                  onClick={() => {
                    switchForm("login");
                    trackGAEvent("Click", "AuthModal", "SwitchToSignInButton");
                  }}
                  className="text-blue-600 hover:text-blue-700 ml-2"
                  aria-label="Switch to sign in"
                  data-testid="switch-to-login"
                >
                  {"Sign In"}
                </button>
              </>
            )}
            {form === "login" && (
              <>
                Don't have an account?
                <button
                  type="button"
                  onClick={() => {
                    switchForm("register");
                    trackGAEvent("Click", "AuthModal", "SwitchToSignUpButton");
                  }}
                  className="text-blue-600 hover:text-blue-700 ml-2"
                  aria-label="Switch to sign up"
                  data-testid="switch-to-register"
                >
                  {"Sign Up"}
                </button>
              </>
            )}
          </p>
          <p className="text-center text-sm text-gray-600 mt-1">
            {form !== "reset" && (
              <button
                type="button"
                onClick={() => {
                  switchForm("reset");
                  trackGAEvent("Click", "AuthModal", "ForgotPasswordButton");
                }}
                className="text-blue-600 hover:text-blue-700 ml-2"
                aria-label="Forgot Password"
                data-testid="forgot-password"
              >
                {"Forgot Password"}
              </button>
            )}
          </p>
          <p className="text-center text-xs text-gray-500 mt-3">
            By continuing, you agree to our{" "}
            <a
              href="https://ampedbio.com/privacy-policy/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 hover:underline"
              data-testid="privacy-policy-link"
              onClick={() => trackGAEvent("Click", "AuthModal", "PrivacyPolicyLink")}
            >
              Privacy Policy
            </a>
          </p>
          {(form === "login" || form === "register") && (
            <p className="text-center text-sm text-gray-600 mt-3">
              Amped.Bio is more than a link-in-bio - it's your passport into the{" "}
              <a
                href="https://www.revolutionnetwork.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 hover:underline"
              >
                Revolution Network
              </a>
              . Your amped.bio profile doubles as your wallet and hub for staking into Reward Pools.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
