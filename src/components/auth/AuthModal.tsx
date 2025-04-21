import { useState, useEffect, useRef } from "react";
import { X, Loader2, Eye, EyeOff, Check, X as XIcon } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import toast from "react-hot-toast";
import type { AuthUser } from "../../types/auth";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import type { LoginData, RegisterData } from "../../api/api.types";
import { Link, useNavigate } from "react-router-dom";
import { useOnelinkAvailability } from "@/hooks/useOnelinkAvailability";
import { URLStatusIndicator } from "@/components/ui/URLStatusIndicator";
import {
  normalizeOnelink,
  cleanOnelinkInput,
  getOnelinkPublicUrl,
  formatOnelink,
} from "@/utils/onelink";

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
    .min(3, "URL must be at least 3 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "URL can only contain letters, numbers, underscores and hyphens"),
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
  const [form, setForm] = useState<FormType>(initialForm);
  const { signIn, signUp, resetPassword } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [sharedEmail, setSharedEmail] = useState("");
  const isUserTyping = useRef(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const navigate = useNavigate();

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

  // Custom form switcher that maintains email
  const switchForm = (newForm: FormType) => {
    setForm(newForm);
  };

  // Handle login form submission
  const onSubmitLogin = async (data: z.infer<typeof loginSchema>) => {
    setLoading(true);
    try {
      const loginData: LoginData = {
        email: data.email,
        password: data.password,
      };

      const user = await signIn(loginData.email, loginData.password);
      toast.success("Welcome back!", { icon: "👋" });
      onClose(user);

      // Redirect the user to their edit page with panel state set to "home"
      if (user && user.onelink) {
        const formattedOnelink = formatOnelink(user.onelink);
        navigate(`/${formattedOnelink}/edit`, { state: { panel: "home" } });
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Handle register form submission
  const onSubmitRegister = async (data: z.infer<typeof registerSchema>) => {
    setLoading(true);
    try {
      const registerData: RegisterData = {
        onelink: data.onelink,
        email: data.email,
        password: data.password,
      };

      const user = await signUp(registerData.onelink, registerData.email, registerData.password);
      toast.success("Account created successfully!");
      onClose(user);

      // Redirect to edit page with home panel selected
      if (user && user.onelink) {
        const formattedOnelink = formatOnelink(user.onelink);
        navigate(`/${formattedOnelink}/edit`, { state: { panel: "home" } });
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Handle password reset form submission
  const onSubmitReset = async (data: z.infer<typeof resetSchema>) => {
    setLoading(true);
    try {
      const response = await resetPassword(data.email);
      toast.success("Reset email sent!");
      onCancel();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 id="auth-modal-title" className="text-xl font-semibold">
            {form === "register" && "Create Account"}
            {form === "login" && "Sign In"}
            {form === "reset" && "Reset Password"}
          </h2>
          <button
            onClick={onCancel}
            className="p-1 text-gray-500 hover:text-gray-700"
            aria-label="Close authentication modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {form === "login" && (
          <form onSubmit={handleSubmitLogin(onSubmitLogin)} className="space-y-4">
            <Input
              label="Email"
              type="email"
              error={loginErrors.email?.message}
              required
              aria-label="Email address"
              autoComplete="email"
              {...registerLogin("email")}
            />
            <div className="relative">
              <Input
                label="Password"
                type={showLoginPassword ? "text" : "password"}
                error={loginErrors.password?.message}
                required
                aria-label="Password"
                autoComplete="current-password"
                {...registerLogin("password")}
              />
              <button
                type="button"
                className="absolute right-3 top-9 text-gray-500 hover:text-gray-700"
                onClick={() => setShowLoginPassword(!showLoginPassword)}
                aria-label={showLoginPassword ? "Hide password" : "Show password"}
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
          </form>
        )}

        {form === "register" && (
          <form onSubmit={handleSubmitSignUp(onSubmitRegister)} className="space-y-4">
            <div className="relative">
              <Input
                label="Amped-Bio Unique URL"
                leftText="@"
                error={registerErrors.onelink?.message}
                required
                aria-label="Amped-Bio Unique URL"
                autoComplete="username"
                placeholder="your-url"
                {...registerSignUp("onelink")}
                onChange={handleOnelinkChange}
              />
              <div className="absolute right-3 top-9">
                <URLStatusIndicator status={urlStatus} isCurrentUrl={false} compact={true} />
              </div>
            </div>
            {onelinkInput && (
              <p className="text-sm text-gray-600">
                Public URL:{" "}
                <a
                  href={getOnelinkPublicUrl(onelinkInput)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700"
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
              aria-label="Email address"
              autoComplete="email"
              {...registerSignUp("email")}
            />
            <div className="space-y-2">
              <div className="relative">
                <Input
                  label="Password"
                  type={showRegisterPassword ? "text" : "password"}
                  error={registerErrors.password?.message}
                  required
                  aria-label="Password"
                  autoComplete="new-password"
                  {...registerSignUp("password")}
                />
                <button
                  type="button"
                  className="absolute right-3 top-9 text-gray-500 hover:text-gray-700"
                  onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                  aria-label={showRegisterPassword ? "Hide password" : "Show password"}
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
            {urlStatus === "Unavailable" && onelinkInput && (
              <p className="text-xs text-center text-red-600">
                This URL is already taken. Please choose another one.
              </p>
            )}
          </form>
        )}

        {form === "reset" && (
          <form onSubmit={handleSubmitReset(onSubmitReset)} className="space-y-4">
            <div className="mb-2">
              <p className="text-sm text-gray-600 mb-4">
                Enter your email address below and we'll send you instructions to reset your
                password.
              </p>
            </div>
            <Input
              label="Email"
              type="email"
              error={resetErrors.email?.message}
              required
              aria-label="Email address"
              autoComplete="email"
              {...registerReset("email")}
            />
            <Button
              type="submit"
              className="w-full relative"
              disabled={loading}
              aria-disabled={loading}
              aria-label="Reset Password"
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

            <div className="text-center text-sm text-gray-600 mt-4 p-3 border border-gray-200 rounded-md bg-gray-50">
              <p>Already have a password reset token?</p>
              <Link
                to="/auth/reset-password/"
                className="inline-block mt-2 text-blue-600 hover:text-blue-700 hover:underline font-medium"
                aria-label="Use reset token"
              >
                Use your reset token here →
              </Link>
            </div>
          </form>
        )}

        <p className="text-center text-sm text-gray-600 mt-2">
          {form !== "login" && (
            <>
              {"Already have an account?"}
              <button
                type="button"
                onClick={() => switchForm("login")}
                className="text-blue-600 hover:text-blue-700 ml-2"
                aria-label={"Switch to sign in"}
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
                onClick={() => switchForm("register")}
                className="text-blue-600 hover:text-blue-700 ml-2"
                aria-label={"Switch to sign up"}
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
              onClick={() => switchForm("reset")}
              className="text-blue-600 hover:text-blue-700 ml-2"
              aria-label={"Forgot Password"}
            >
              {"Forgot Password"}
            </button>
          )}
        </p>
      </div>
    </div>
  );
}
