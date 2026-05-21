import { useState, useEffect, useCallback, useRef } from "react";
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

type FlowStep =
  | "login"
  | "wallet_wait"
  | "announcing"
  | "awaiting_message"
  | "trust"
  | "sign"
  | "done";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters long"),
});

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function SignPage() {
  const { authUser, isPending: isAuthPending } = useAuth();
  const { address, isConnected } = useAccount();
  const { signMessageAsync, isPending: isSigning } = useSignMessage();
  const { executeCaptcha } = useCaptcha();

  const isPopup = typeof window !== "undefined" && !!window.opener;

  const [flowStep, setFlowStep] = useState<FlowStep>("login");
  const [openerOrigin, setOpenerOrigin] = useState<string | null>(null);
  const [messageToSign, setMessageToSign] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [signError, setSignError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errorState, setErrorState] = useState<string | null>(null);
  const prevFlowStep = useRef<FlowStep>("login");

  const {
    register,
    handleSubmit,
    formState: { errors: loginErrors },
  } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    mode: "onBlur",
  });

  const sendToOpener = useCallback(
    (data: object) => {
      if (isPopup && window.opener) {
        window.opener.postMessage(data, "*");
      }
    },
    [isPopup]
  );

  const startAnnouncing = useCallback(async () => {
    const from = prevFlowStep.current;
    prevFlowStep.current = "announcing";
    setFlowStep("announcing");
    console.log(`[S] flowStep changed: ${from} → announcing`);
    setStatusMessage("Preparing to communicate with requesting site...");
    await delay(1000);
    console.log('[S] postMessage sent:', JSON.stringify({ type: "SIGN_READY" }));
    sendToOpener({ type: "SIGN_READY" });
    prevFlowStep.current = "awaiting_message";
    setFlowStep("awaiting_message");
    console.log('[S] flowStep changed: announcing → awaiting_message');
    setStatusMessage("Waiting for message to sign...");
  }, [sendToOpener]);

  // Transition: user logs in
  useEffect(() => {
    if (!authUser) return;
    if (flowStep !== "login") return;

    if (!isConnected) {
      prevFlowStep.current = "wallet_wait";
      setFlowStep("wallet_wait");
      console.log('[S] flowStep changed: login → wallet_wait');
      setStatusMessage("Connecting wallet...");
    } else {
      startAnnouncing();
    }
  }, [authUser, isConnected, flowStep, startAnnouncing]);

  // Transition: wallet connects
  useEffect(() => {
    if (!isConnected || !authUser) return;
    if (flowStep === "wallet_wait") {
      console.log('[S] flowStep changed: wallet_wait → announcing');
      startAnnouncing();
    }
  }, [isConnected, authUser, flowStep, startAnnouncing]);

  // Listen for SIGN_MESSAGE from opener
  useEffect(() => {
    if (flowStep !== "awaiting_message") return;

    const timeout = setTimeout(() => {
      setErrorState(
        "Communication timeout — The requesting site did not respond."
      );
    }, 30000);

    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type !== "SIGN_MESSAGE") return;
      clearTimeout(timeout);

      console.log(
        '[S] postMessage received:',
        JSON.stringify({
          origin: event.origin,
          type: event.data.type,
          message: event.data.message,
        })
      );

      const origin = event.origin;
      let decodedMessage: string;
      try {
        decodedMessage = atob(event.data.message);
      } catch {
        return;
      }

      console.log('[S] decoded message:', JSON.stringify(decodedMessage));

      setOpenerOrigin(origin);
      setMessageToSign(decodedMessage);

      console.log(
        '[S] postMessage sent:',
        JSON.stringify({ type: "SIGN_MESSAGE_RECEIVED" })
      );
      sendToOpener({ type: "SIGN_MESSAGE_RECEIVED" });

      setStatusMessage("Message received. Verifying requesting site...");
      await delay(1000);

      prevFlowStep.current = "trust";
      setFlowStep("trust");
      console.log('[S] flowStep changed: awaiting_message → trust');
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      clearTimeout(timeout);
    };
  }, [flowStep, sendToOpener]);

  const handleTrustConfirm = () => {
    prevFlowStep.current = "sign";
    setFlowStep("sign");
    console.log('[S] flowStep changed: trust → sign');
  };

  const handleSign = async () => {
    if (!messageToSign) return;
    setSignError(null);
    try {
      const sig = await signMessageAsync({ message: messageToSign });
      console.log('[S] signMessageAsync result:', JSON.stringify(sig));
      setSignature(sig);
      prevFlowStep.current = "done";
      setFlowStep("done");
      console.log('[S] flowStep changed: sign → done');
    } catch (error) {
      setSignError((error as Error).message || "Signing failed");
    }
  };

  const handleCloseWindow = () => {
    if (!signature || !address) return;

    sessionStorage.removeItem("sign_opener_origin");

    console.log(
      '[S] postMessage sent:',
      JSON.stringify({
        type: "SIGNATURE_RESULT",
        signature,
        address,
      })
    );

    sendToOpener({
      type: "SIGNATURE_RESULT",
      signature,
      address,
    });

    window.close();
  };

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

  const isSubmitting = isLoggingIn;

  if (!isPopup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4 text-center">
              <AlertCircle className="h-10 w-10 text-red-500" />
              <CardTitle>Invalid Access</CardTitle>
              <CardDescription>
                This page must be opened from a requesting site.
              </CardDescription>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isAuthPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 p-4">
      <div className="w-full max-w-sm mx-auto flex-1 flex flex-col justify-center">
        {errorState && (
          <Card className="w-full border-red-200">
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-4 text-center">
                <AlertCircle className="h-10 w-10 text-red-500" />
                <CardTitle>Error</CardTitle>
                <CardDescription>{errorState}</CardDescription>
              </div>
            </CardContent>
          </Card>
        )}

        {!errorState && flowStep === "login" && (
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

        {/* Wallet Wait Step */}
        {!errorState && flowStep === "wallet_wait" && (
          <Card className="w-full">
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <p className="text-sm text-gray-500">{statusMessage}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Announcing Step */}
        {!errorState && flowStep === "announcing" && (
          <Card className="w-full">
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <p className="text-sm text-gray-500">{statusMessage}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Awaiting Message Step */}
        {!errorState && flowStep === "awaiting_message" && (
          <Card className="w-full">
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <p className="text-sm text-gray-500">{statusMessage}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Trust Step */}
        {!errorState && flowStep === "trust" && openerOrigin === null && (
          <Card className="w-full border-red-200">
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-4 text-center">
                <AlertCircle className="h-10 w-10 text-red-500" />
                <CardTitle>Unable to verify requesting site</CardTitle>
                <CardDescription>
                  Cannot determine the origin of the request.
                </CardDescription>
              </div>
            </CardContent>
          </Card>
        )}

        {!errorState && flowStep === "trust" && openerOrigin !== null && (
          <Card className="w-full">
            <CardHeader>
              <div className="flex items-center gap-2 text-blue-600">
                <AlertTriangle className="h-5 w-5" />
                <CardTitle>Verify Requesting Site</CardTitle>
              </div>
              <CardDescription>
                Verify that you know and trust the site requesting your
                signature before proceeding.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    Requesting Origin
                  </p>
                  <p className="text-sm font-mono text-gray-900 break-all">
                    {openerOrigin}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    Message to sign
                  </p>
                  <pre className="text-sm text-gray-900 break-all whitespace-pre-wrap font-mono">
                    {messageToSign}
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
              <Button onClick={handleTrustConfirm} className="w-full">
                I Know and Trust This Site
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Sign Step */}
        {!errorState && flowStep === "sign" && (
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Sign Message</CardTitle>
              <CardDescription>
                Sign the following message with your connected wallet to
                continue.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                  <p className="text-xs font-medium text-gray-500 mb-1">
                    Message to sign
                  </p>
                  <pre className="text-sm text-gray-900 break-all whitespace-pre-wrap font-mono">
                    {messageToSign}
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
                      We do not recommend signing unreadable or unknown
                      messages. Amped.bio is not responsible for what you sign
                      with your wallet.
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
            </CardContent>
          </Card>
        )}

        {/* Done Step */}
        {!errorState && flowStep === "done" && (
          <Card className="w-full">
            <CardHeader>
              <div className="flex items-center gap-2 text-green-600">
                <Check className="h-6 w-6" />
                <CardTitle>Message Signed</CardTitle>
              </div>
              <CardDescription>
                The signature has been sent back to the requesting site. You can
                close this window.
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
              <Button
                onClick={handleCloseWindow}
                variant="confirm"
                className="w-full"
              >
                <X className="mr-2 h-5 w-5" />
                Close Window
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
              Do you really want to sign this message? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-md mt-2">
            <p className="text-xs font-medium text-gray-500 mb-1">
              Message to sign
            </p>
            <pre className="text-xs text-gray-900 break-all whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">
              {messageToSign}
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
