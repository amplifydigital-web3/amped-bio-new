import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAccount, useSignMessage } from "wagmi";
import { useCaptcha } from "@/hooks/useCaptcha";
import { CaptchaActions } from "@ampedbio/constants";
import {
  Check,
  Loader2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  LogIn,
  PenTool,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type Step = 1 | 2 | 3 | 4;

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters long"),
});

const paramsSchemaPopup = z.object({
  message: z.string().min(1, "Message is required"),
});

const paramsSchemaDirect = z.object({
  message: z.string().min(1, "Message is required"),
  redirect: z
    .string()
    .min(1, "Redirect URL is required")
    .refine(
      (url) => {
        try {
          const parsed = new URL(url);
          return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "Redirect URL must be a valid http/https URL" }
    ),
});

type Params = { message: string; redirect?: string };

function getRedirectHostname(redirectUrl?: string): string {
  if (!redirectUrl) return "the requesting site";
  try {
    return new URL(redirectUrl).hostname;
  } catch {
    return "site";
  }
}

function getOpenerHostname(): string {
  try {
    if (document.referrer) {
      return new URL(document.referrer).hostname;
    }
  } catch {}
  return "the requesting site";
}

function getRequestingUrl(params: { redirect?: string } | null): string {
  if (params?.redirect) return params.redirect;
  try {
    if (document.referrer) {
      return new URL(document.referrer).href;
    }
  } catch {}
  return "the requesting site";
}

const STEP_DEFS = [
  { num: 1, label: "Login", icon: LogIn },
  { num: 2, label: "Trust", icon: ShieldCheck },
  { num: 3, label: "Sign", icon: PenTool },
  { num: 4, label: "Return", icon: ArrowRight },
];

export function SignPage() {
  const { authUser, isPending: isAuthPending } = useAuth();
  const { address, isConnected } = useAccount();
  const { signMessageAsync, isPending: isSigning } = useSignMessage();
  const { executeCaptcha } = useCaptcha();

  const isPopup = typeof window !== "undefined" && !!window.opener;

  const [params, setParams] = useState<Params | null>(null);
  const [paramsError, setParamsError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [trustConfirmed, setTrustConfirmed] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors: loginErrors },
  } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    mode: "onBlur",
  });

  useEffect(() => {
    const search = window.location.search;
    const sp = new URLSearchParams(search);
    const m = sp.get("m");
    const r = sp.get("r");

    let message: string | null = null;
    let redirect: string | null = null;

    try {
      message = m ? atob(m) : null;
    } catch {
      setParamsError("Invalid base64 encoding in 'm' parameter");
      return;
    }

    try {
      redirect = r ? atob(r) : null;
    } catch {
      setParamsError("Invalid base64 encoding in 'r' parameter");
      return;
    }

    if (isPopup) {
      const result = paramsSchemaPopup.safeParse({ message });
      if (!result.success) {
        const firstError =
          result.error.issues[0]?.message || "Invalid parameters";
        setParamsError(firstError);
        return;
      }
      setParams(result.data);
    } else {
      const result = paramsSchemaDirect.safeParse({ message, redirect: redirect ?? undefined });
      if (!result.success) {
        const firstError =
          result.error.issues[0]?.message || "Invalid parameters";
        setParamsError(firstError);
        return;
      }
      setParams(result.data);
    }
  }, [isPopup]);

  const step: Step = !authUser ? 1 : signature ? 4 : trustConfirmed ? 3 : 2;

  const onSubmitLogin = async (data: z.infer<typeof loginSchema>) => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const recaptchaToken = await executeCaptcha(CaptchaActions.LOGIN);
      const response = await authClient.signIn.email({
        email: data.email,
        password: data.password,
        callbackURL: window.location.href,
        rememberMe: true,
        fetchOptions: {
          headers: recaptchaToken
            ? {
                "x-captcha-response": recaptchaToken,
              }
            : undefined,
        },
      });
      if (response?.error) {
        throw new Error(response.error.message || "Login failed");
      }
    } catch (error) {
      setLoginError((error as Error).message || "Login failed");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSign = async () => {
    if (!params) return;
    setSignError(null);
    try {
      const sig = await signMessageAsync({ message: params.message });
      setSignature(sig);
    } catch (error) {
      setSignError((error as Error).message || "Signing failed");
    }
  };

  const handleReturn = () => {
    if (!params || !signature || !address) return;

    if (isPopup) {
      window.opener!.postMessage(
        {
          type: "SIGNATURE_RESULT",
          signature,
          address,
          message: params.message,
        },
        "*"
      );
      window.close();
      return;
    }

    if (!params.redirect) return;
    const url = new URL(params.redirect);
    url.searchParams.set("s", signature);
    url.searchParams.set("a", address);
    window.location.href = url.toString();
  };

  const isSubmitting = isLoggingIn;

  // --- Initial loading (auth state not yet determined) ---
  if (isAuthPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // --- Invalid / missing params ---
  if (paramsError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-sm mx-auto">
          <CardHeader>
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              <CardTitle>Invalid Request</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">{paramsError}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!params) {
    return null;
  }

  // --- Main stepper ---
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 p-4">
      <div className="w-full max-w-sm mx-auto flex-1 flex flex-col justify-center">
        {/* Stepper indicator */}
        <div className="flex items-center justify-center mb-8">
          {STEP_DEFS.map((stepDef, index) => {
            const isCompleted = step > (stepDef.num as Step);
            const isCurrent = step === (stepDef.num as Step);
            const StepIcon = stepDef.icon;
            return (
              <div key={stepDef.num} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                      isCompleted
                        ? "bg-green-500 text-white"
                        : isCurrent
                          ? "bg-blue-500 text-white"
                          : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <StepIcon className="h-4 w-4" />
                    )}
                  </div>
                  <span className="text-xs mt-1 text-gray-500">
                    {stepDef.label}
                  </span>
                </div>
                {index < STEP_DEFS.length - 1 && (
                  <div
                    className={`w-7 h-1 mx-1 rounded ${
                      step > (stepDef.num as Step)
                        ? "bg-green-500"
                        : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Step 1: Login */}
        {step === 1 && (
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Sign In</CardTitle>
              <CardDescription>
                Sign in to your Amped Bio account to continue with signing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={handleSubmit(onSubmitLogin)}
                className="space-y-4"
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
                  disabled={isSubmitting}
                  {...register("email")}
                />
                <Input
                  label="Password"
                  type="password"
                  error={loginErrors.password?.message}
                  required
                  disabled={isSubmitting}
                  {...register("password")}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Trust Verification */}
        {step === 2 && (
          <Card className="w-full">
            <CardHeader>
              <div className="flex items-center gap-2 text-blue-600">
                <ShieldCheck className="h-5 w-5" />
                <CardTitle>Verify Requesting Site</CardTitle>
              </div>
              <CardDescription>
                Verify that you know and trust the site requesting your signature
                before proceeding.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    Requesting URL
                  </p>
                  <p className="text-sm font-mono text-gray-900 break-all">
                    {getRequestingUrl(params)}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    Message to sign
                  </p>
                  <pre className="text-sm text-gray-900 break-all whitespace-pre-wrap font-mono">
                    {params.message}
                  </pre>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-amber-800">
                    Only proceed if you recognize and trust the requesting site.
                    Signing unknown messages can compromise your wallet security.
                  </p>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                onClick={() => setTrustConfirmed(true)}
                className="w-full"
              >
                I Know and Trust This Site
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Step 3: Sign */}
        {step === 3 && (
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Sign Message</CardTitle>
              <CardDescription>
                Sign the following message with your connected wallet to
                continue.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!isConnected ? (
                <div className="flex flex-col items-center py-8 gap-3">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                  <p className="text-sm text-gray-500">Connecting wallet...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                    <p className="text-xs font-medium text-gray-500 mb-1">
                      Message to sign
                    </p>
                    <pre className="text-sm text-gray-900 break-all whitespace-pre-wrap font-mono">
                      {params.message}
                    </pre>
                  </div>
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                    <p className="text-xs font-medium text-gray-500 mb-1">
                      Wallet address
                    </p>
                    <p className="text-sm font-mono text-gray-900 truncate">
                      {address}
                    </p>
                    </div>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-md flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-amber-800">
                        Please review carefully before signing
                      </p>
                      <p className="text-xs text-amber-700">
                        We do not recommend signing unreadable or unknown messages. Amped.bio is not responsible for what you sign with your wallet.
                      </p>
                    </div>
                  </div>
                  {signError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-red-600">{signError}</p>
                    </div>
                  )}
                  <Button
                    onClick={() => setShowConfirmModal(true)}
                    className="w-full"
                    disabled={isSigning}
                  >
                    {isSigning ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      "Sign Message"
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 4: Done */}
        {step === 4 && (
          <Card className="w-full">
            <CardHeader>
              <div className="flex items-center gap-2 text-green-600">
                <Check className="h-6 w-6" />
                <CardTitle>Message Signed</CardTitle>
              </div>
              <CardDescription>
                {isPopup ? (
                  <>
                    The signature has been sent back to{" "}
                    <span className="font-medium">{getOpenerHostname()}</span>.
                    You can close this window.
                  </>
                ) : (
                  <>
                    You will be redirected back to{" "}
                    <span className="font-medium">
                      {getRedirectHostname(params.redirect)}
                    </span>{" "}
                    with your signed message.
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                <p className="text-xs font-medium text-gray-500 mb-1">
                  Signature
                </p>
                <p className="text-sm font-mono text-gray-900 break-all">
                  {signature}
                </p>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleReturn} variant="confirm" className="w-full">
                {isPopup ? (
                  <>
                    <X className="mr-2 h-5 w-5" />
                    Close Window
                  </>
                ) : (
                  <>
                    <ArrowRight className="mr-2 h-5 w-5" />
                    Return to {getRedirectHostname(params.redirect)}
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>

      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle>Confirm Signing</DialogTitle>
            </div>
            <DialogDescription className="text-left">
              Do you really want to sign this message? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-md mt-2">
            <p className="text-xs font-medium text-gray-500 mb-1">
              Message to sign
            </p>
            <pre className="text-xs text-gray-900 break-all whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">
              {params.message}
            </pre>
          </div>
          <DialogFooter className="mt-4 flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirmModal(false)}
              className="flex-1"
              disabled={isSigning}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowConfirmModal(false);
                handleSign();
              }}
              className="flex-1"
              disabled={isSigning}
            >
              {isSigning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                "I Understand, Sign"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
