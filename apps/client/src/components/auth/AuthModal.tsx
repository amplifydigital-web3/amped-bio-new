import { useState, useEffect, useRef } from "react";
import { X, Loader2, Eye, EyeOff, Check, X as XIcon, AlertCircle } from "lucide-react";
import ReCAPTCHA from "react-google-recaptcha";
import { useAuth } from "../../contexts/AuthContext";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import type { AuthUser } from "../../types/auth";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useOnelinkAvailability } from "@/hooks/useOnelinkAvailability";
import { URLStatusIndicator } from "@/components/ui/URLStatusIndicator";
import { GoogleLogin } from "@react-oauth/google";
import {
  normalizeOnelink,
  cleanOnelinkInput,
  getOnelinkPublicUrl,
  formatOnelink,
} from "@/utils/onelink";
import { trackGAEvent } from "@/utils/ga";

interface AuthModalProps {
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

export function AuthModal({ onClose, onCancel, initialForm = "login" }: AuthModalProps) {
  const { signIn, signInWithGoogle, signUp, resetPassword } = useAuth();
  const [loading, setLoading] = useState(false);
  const [sharedEmail, setSharedEmail] = useState("");
  const isUserTyping = useRef(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const isRecaptchaEnabled =
    import.meta.env.MODE !== "testing" && !!import.meta.env.VITE_RECAPTCHA_SITE_KEY;
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
      const loginData = {
        email: data.email,
        password: data.password,
        recaptchaToken: recaptchaToken,
      };

      const user = await signIn(loginData.email, loginData.password, loginData.recaptchaToken);
      onClose(user);

      // Redirect the user to their edit page with panel state set to "home"
      if (user && user.onelink) {
        const formattedOnelink = formatOnelink(user.onelink);
        navigate(`/${formattedOnelink}/edit`, { state: { panel: "home" } });
      }
    } catch (error) {
      setLoginError((error as Error).message);
      // Reset reCAPTCHA on error
      if (isRecaptchaEnabled && recaptchaRef.current) {
        recaptchaRef.current.reset();
        setRecaptchaToken(null);
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle Google login
  const handleGoogleLogin = async (token: string) => {
    setLoading(true);
    setLoginError(null);
    try {
      const user = await signInWithGoogle(token);
      onClose(user);

      // Redirect the user to their edit page with panel state set to "home"
      if (user && user.onelink) {
        const formattedOnelink = formatOnelink(user.onelink);
        navigate(`/${formattedOnelink}/edit`, { state: { panel: "home" } });
      }
    } catch (error) {
      setLoginError((error as Error).message);
      // Reset reCAPTCHA on error if enabled
      if (isRecaptchaEnabled && recaptchaRef.current) {
        recaptchaRef.current.reset();
        setRecaptchaToken(null);
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle register form submission
  const onSubmitRegister = async (data: z.infer<typeof registerSchema>) => {
    setLoading(true);
    setRegisterError(null);
    try {
      const registerData = {
        onelink: data.onelink,
        email: data.email,
        password: data.password,
        recaptchaToken: recaptchaToken,
      };

      const user = await signUp(
        registerData.onelink,
        registerData.email,
        registerData.password,
        registerData.recaptchaToken
      );
      onClose(user);

      // Redirect to edit page with home panel selected
      if (user && user.onelink) {
        const formattedOnelink = formatOnelink(user.onelink);
        navigate(`/${formattedOnelink}/edit`, { state: { panel: "home" } });
      }
    } catch (error) {
      setRegisterError((error as Error).message);
      // Reset reCAPTCHA on error
      if (isRecaptchaEnabled && recaptchaRef.current) {
        recaptchaRef.current.reset();
        setRecaptchaToken(null);
      }
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
      const response = await resetPassword(data.email, recaptchaToken);
      if (response.success) {
        setResetSuccess(true);
      } else {
        setResetError(response.message || "Failed to reset password");
        // Reset reCAPTCHA on error response
        if (isRecaptchaEnabled && recaptchaRef.current) {
          recaptchaRef.current.reset();
          setRecaptchaToken(null);
        }
      }
    } catch (error) {
      setResetError((error as Error).message);
      // Reset reCAPTCHA on error
      if (isRecaptchaEnabled && recaptchaRef.current) {
        recaptchaRef.current.reset();
        setRecaptchaToken(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const renderReCaptcha = () => {
    return (
      <>
        {isRecaptchaEnabled && (
          <div className="flex justify-center">
            <ReCAPTCHA
              sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY}
              onChange={token => setRecaptchaToken(token)}
              onExpired={() => setRecaptchaToken(null)}
              ref={recaptchaRef}
            />
          </div>
        )}
      </>
    );
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
              <GoogleLogin
                onSuccess={credentialResponse => {
                  if (credentialResponse.credential) {
                    handleGoogleLogin(credentialResponse.credential);
                  }
                }}
                onError={() => {
                  setLoginError("Google login failed");
                }}
                // useOneTap
                type="standard"
                theme="outline"
                text="continue_with"
                shape="rectangular"
                width="100%"
                locale="en"
                size="large"
                containerProps={{
                  className: "w-full",
                }}
              />
            </div>
          </>
        )}
      </>
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      data-testid="auth-modal"
    >
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2
            id="auth-modal-title"
            className="text-xl font-semibold"
            data-testid="auth-modal-title"
            aria-label="auth-modal-title"
          >
            {form === "register" && "Sign Up for Free"}
            {form === "login" && "Sign In"}
            {form === "reset" && "Reset Password"}
          </h2>
          <button
            onClick={() => {
              onCancel();
              trackGAEvent("Click", "AuthModal", "CloseModalButton");
            }}
            className="p-1 text-gray-500 hover:text-gray-700"
            aria-label="Close authentication modal"
            data-testid="auth-modal-close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

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
            {renderReCaptcha()}
            <Button
              type="submit"
              className="w-full relative"
              disabled={loading || (isRecaptchaEnabled && !recaptchaToken)}
              aria-disabled={loading || (isRecaptchaEnabled && !recaptchaToken)}
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
            {renderReCaptcha()}
            <Button
              type="submit"
              className="w-full relative"
              disabled={
                loading ||
                urlStatus === "Unavailable" ||
                !isValid ||
                !onelinkInput ||
                (isRecaptchaEnabled && !recaptchaToken)
              }
              aria-disabled={
                loading ||
                urlStatus === "Unavailable" ||
                !isValid ||
                !onelinkInput ||
                (isRecaptchaEnabled && !recaptchaToken)
              }
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
              <p className="text-xs text-center text-red-600" data-testid="url-unavailable-message">
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
                {renderReCaptcha()}
                <Button
                  type="submit"
                  className="w-full relative"
                  disabled={loading || (isRecaptchaEnabled && !recaptchaToken)}
                  aria-disabled={loading || (isRecaptchaEnabled && !recaptchaToken)}
                  aria-label="Send Reset Instructions"
                  data-testid="reset-submit"
                  onClick={() => trackGAEvent("Click", "AuthModal", "SendResetInstructionsButton")}
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
      </div>
    </div>
  );
}
