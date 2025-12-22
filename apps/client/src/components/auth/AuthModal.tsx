import { useState, useEffect, useRef } from "react";
import { Loader2, Eye, EyeOff, Check, X as XIcon, AlertCircle } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import type { AuthUser } from "../../types/auth";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useLocation } from "react-router";
import { useOnelinkAvailability } from "@/hooks/useOnelinkAvailability";
import { URLStatusIndicator } from "@/components/ui/URLStatusIndicator";
import { GoogleLoginButton } from "./GoogleLoginButton";
import { useCaptcha } from "@/hooks/useCaptcha";
import { CaptchaActions } from "@ampedbio/constants";
import { authClient } from "@/lib/auth-client";
import {
  normalizeOnelink,
  cleanOnelinkInput,
  getOnelinkPublicUrl,
  formatOnelink,
} from "@/utils/onelink";
import { trackGAEvent } from "@/utils/ga";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// Extended user type for better-auth session
interface BetterAuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
  onelink?: string | null;
  role?: string;
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
  onelink: z
    .string()
    .min(3, "Name must be at least 3 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Name can only contain letters, numbers, underscores and hyphens"),
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
  const { signIn, signInWithGoogle, signUp, resetPassword } = useAuth();
  const { executeCaptcha, isRecaptchaEnabled } = useCaptcha();
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

  const [onelinkInput, setOnelinkInput] = useState("");
  const { urlStatus, isValid } = useOnelinkAvailability(onelinkInput);

  // Handle onelink input changes with proper cleaning
  const handleOnelinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleanValue = cleanOnelinkInput(e.target.value);
    setOnelinkInput(cleanValue);
    setRegisterValue("onelink", cleanValue);
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
  const registerOnelink = watchRegister("onelink");
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

  // Check onelink availability when it changes
  useEffect(() => {
    if (registerOnelink) {
      const normalizedOnelink = normalizeOnelink(registerOnelink);
      setOnelinkInput(normalizedOnelink);
    }
  }, [registerOnelink]);

  // Custom form switcher that maintains email and clears errors
  const switchForm = (newForm: FormType) => {
    setLoginError(null);
    setRegisterError(null);
    setResetError(null);
    setResetSuccess(false);
    setForm(newForm);

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
      const recaptchaToken = isRecaptchaEnabled ? await executeCaptcha(CaptchaActions.LOGIN) : null;

      // Using better-auth for email/password login
      const response = await authClient.signIn.email({
        email: data.email,
        password: data.password,
        callbackURL: `/${normalizeOnelink(data.email.split("@")[0] || "home")}/edit`,
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

      // After successful login, get the current session to get user details
      const session = await authClient.getSession();
      if (session?.data?.user) {
        const user = session.data.user as BetterAuthUser;
        onClose({
          id: parseInt(user.id),
          email: user.email,
          onelink: user.onelink || user.name || user.email?.split("@")[0] || "",
          role: user.role || "user",
          image: user.image || null,
          wallet: null,
        });

        // Redirect the user to their edit page with panel state set to "home"
        const userData = session.data.user as BetterAuthUser;
        const onelink =
          userData.onelink || userData.name || userData.email?.split("@")[0] || "home";
        const formattedOnelink = formatOnelink(onelink);
        navigate(`/${formattedOnelink}/edit`, { state: { panel: "home" } });
      } else {
        throw new Error("Login successful but could not retrieve user session");
      }
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
      // Store the current location to redirect after successful login
      const redirectAfterLogin = () => {
        // Check session after some time to see if login was successful
        setTimeout(async () => {
          try {
            const session = await authClient.getSession();
            if (session?.data?.user) {
              const user = session.data.user as BetterAuthUser;
              onClose({
                id: parseInt(user.id),
                email: user.email,
                onelink: user.onelink || user.name || (user.email ? user.email.split("@")[0] : ""),
                role: user.role || "user",
                image: user.image || null,
                wallet: null,
              });

              const userData = session.data.user as BetterAuthUser;
              const onelink =
                userData.onelink || userData.name || userData.email?.split("@")[0] || "home";
              const formattedOnelink = formatOnelink(onelink);
              navigate(`/${formattedOnelink}/edit`, { state: { panel: "home" } });
            }
          } catch (error) {
            setLoginError((error as Error).message || "Failed to get session after login");
          } finally {
            setLoading(false);
          }
        }, 2000); // Wait 2 seconds to allow redirect and session establishment
      };

      // Using better-auth's Google OAuth flow
      // This will likely redirect the user to Google's authentication page
      const response = await authClient.signIn.social({
        provider: "google",
        callbackURL: window.location.href, // Return to current page
      });

      if (response?.error) {
        setLoading(false);
        setLoginError(response.error.message || "Google login failed");
        return;
      }

      // Set up monitoring for session after redirect
      redirectAfterLogin();
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
      // Get reCAPTCHA token using the invisible captcha
      const recaptchaToken = isRecaptchaEnabled
        ? await executeCaptcha(CaptchaActions.REGISTER)
        : null;

      // Using better-auth signup
      const response = await authClient.signUp.email({
        email: data.email,
        password: data.password,
        name: data.onelink, // Using onelink as the name
        callbackURL: `/${data.onelink}/edit`,
      });

      if (response?.error) {
        throw new Error(response.error.message || "Registration failed");
      }

      // After successful registration, get the current session to get user details
      const session = await authClient.getSession();
      if (session?.data?.user) {
        const user = session.data.user as BetterAuthUser;
        onClose({
          id: parseInt(user.id),
          email: user.email,
          onelink: user.onelink || user.name || data.onelink,
          role: user.role || "user",
          image: user.image || null,
          wallet: null,
        });

        // Redirect to edit page with home panel selected
        const formattedOnelink = formatOnelink(user.name || data.onelink);
        navigate(`/${formattedOnelink}/edit`, { state: { panel: "home" } });
      } else {
        throw new Error("Registration successful but could not retrieve user session");
      }
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
      const recaptchaToken = isRecaptchaEnabled
        ? await executeCaptcha(CaptchaActions.RESET_PASSWORD)
        : null;

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
              {registerError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-600">{registerError}</p>
                </div>
              )}
              <div className="relative">
                <Input
                  label="Claim your name"
                  leftText="@"
                  error={registerErrors.onelink?.message}
                  required
                  aria-label="Claim your name"
                  data-testid="register-onelink"
                  autoComplete="username"
                  placeholder="your-name"
                  {...registerSignUp("onelink")}
                  onChange={e => {
                    registerSignUp("onelink").onChange(e);
                    handleOnelinkChange(e);
                  }}
                  onBlur={e => {
                    registerSignUp("onelink").onBlur(e);
                    trackGAEvent("Input", "AuthModal", "RegisterOnelinkInput");
                  }}
                />
                <div className="absolute right-3 top-9">
                  <URLStatusIndicator status={urlStatus} isCurrentUrl={false} compact={true} />
                </div>
              </div>
              {onelinkInput && (
                <p className="text-sm text-gray-600" data-testid="public-url-preview">
                  Public URL:{" "}
                  <a
                    href={getOnelinkPublicUrl(onelinkInput)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700"
                    onClick={() => trackGAEvent("Click", "AuthModal", "PublicURLPreviewLink")}
                  >
                    {getOnelinkPublicUrl(onelinkInput)}
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
                disabled={loading || urlStatus === "Unavailable" || !isValid || !onelinkInput}
                aria-disabled={loading || urlStatus === "Unavailable" || !isValid || !onelinkInput}
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

              {urlStatus === "Unavailable" && onelinkInput && (
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
                    Instructions to reset your password have been sent to your email.
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
                    to="/auth/reset-password/"
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
