"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import { injected } from "wagmi/connectors";
import { useWeb3Auth, useWeb3AuthConnect } from "@web3auth/modal/react";
import { AUTH_CONNECTION, CONNECTOR_STATUS, WALLET_CONNECTORS } from "@web3auth/modal";
import { z } from "zod";
import {
  BadgeCheck,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Info,
  PenLine,
  RotateCcw,
  XCircle,
} from "lucide-react";
import {
  Button,
  Checkbox,
  GoogleSignInButton,
  InlineError,
  Input,
  Notice,
  OrDivider,
  PasswordInput,
  Skeleton,
  StepBar,
  classifyAuthError,
  cn,
  startGoogleSignIn,
} from "@repo/ui";
import { useAuth } from "@/contexts/AuthContext";
import { authClient } from "@/lib/auth-client";
import { trpcClient } from "@/lib/trpc";
import { useCaptcha } from "@/hooks/useCaptcha";
import {
  SIGN_ERRORS,
  SIGN_NOTE_BROWSER_WALLET,
  SIGN_NOTE_EMBEDDED_WALLET,
  hostOf,
  type SignErrorKind,
} from "./signCopy";

/**
 * Screen Review 074: /sign as the money flow pattern in the G3 value panel
 * (D12). Connect (sign in, then the wallet), Review (site, wallet, message,
 * one checkbox), Confirm in wallet (D23). Messages are accepted only from the
 * opener (I05) and only from registered Amped.Bio apps (D3).
 */

type Phase =
  | "checking"
  | "login"
  | "connect_browser"
  | "connecting"
  | "waiting"
  | "verifying"
  | "review"
  | "signing"
  | "done";

type App = { name: string; icon: string | null };

const STEPS = ["Connect", "Review", "Confirm in wallet"];
const WAIT_MS = 30_000;
const SKELETON_AFTER_MS = 400;
const BROWSER_WALLET_MODE = process.env.NEXT_PUBLIC_AUTH_MODE === "force_metamask";
const POPUP_KEY = "sign_is_popup";
const OPENER_KEY = "sign_opener_origin";

const emailSchema = z.string().email();

function readSession(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeSession(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Storage blocked: the popup still works without the Google round trip state
  }
}

const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

function useAfter(ms: number, key: unknown) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDone(false);
    const timer = setTimeout(() => setDone(true), ms);
    return () => clearTimeout(timer);
  }, [ms, key]);
  return done;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={() =>
          void navigator.clipboard
            ?.writeText(value)
            .then(() => setCopied(true))
            .catch(() => undefined)
        }
        className="prism-icon-btn prism-focus shrink-0"
      >
        {copied ? (
          <Check aria-hidden className="h-[21px] w-[21px] text-prism-success" />
        ) : (
          <Copy aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
        )}
      </button>
      <span role="status" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </>
  );
}

/** 074 I11, I22: calm card on the room for a page that is not a signing popup. */
function CalmCard({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <main className="prism-room flex min-h-dvh items-center justify-center px-[21px] py-[34px] font-prism">
      <section className="prism-glass-clear w-full max-w-[508px] !rounded-prism-21 p-[21px] sm:p-[34px]">
        <Info aria-hidden className="h-[21px] w-[21px] text-prism-nav" />
        <h1 className="mt-[13px] text-prism-panel-title text-prism-ink">{title}</h1>
        <p className="mt-2 text-prism-body text-prism-ink">{body}</p>
        <div className="mt-[21px]">{action}</div>
      </section>
    </main>
  );
}

/** 074 I03, I21: the errors convention on a G2 slab inside the panel. */
function SignError({
  kind,
  host,
  onRetry,
  onClose,
}: {
  kind: SignErrorKind;
  host: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  const copy = SIGN_ERRORS[kind];
  return (
    <div role="alert" className="prism-slab flex items-start gap-3 p-[21px]">
      <XCircle aria-hidden className="mt-px h-[21px] w-[21px] shrink-0 text-prism-danger" />
      <div className="min-w-0 flex-1">
        <p className="text-prism-label font-bold text-prism-ink">{copy.title}</p>
        <p className="mt-1 text-prism-meta text-prism-danger">{copy.cause(host)}</p>
        <div className="mt-[13px] flex flex-wrap gap-2">
          {copy.retry && (
            <Button variant="secondary" onClick={onRetry}>
              <RotateCcw aria-hidden />
              Retry
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Close window
          </Button>
        </div>
      </div>
    </div>
  );
}

function SlabRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-h-touch border-b border-prism-line px-[13px] py-[10px] last:border-b-0">
      <p className="text-prism-meta text-prism-ink-2">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function SignFlow() {
  const { authUser, isPending: authPending } = useAuth();
  const { address, isConnected } = useAccount();
  const { connectAsync, isPending: browserConnecting } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const { web3Auth } = useWeb3Auth();
  const { connectTo } = useWeb3AuthConnect();
  const { executeCaptcha, isCaptchaEnabled } = useCaptcha();

  // null until mounted; window.opener exists only in the browser
  const [opener, setOpener] = useState<"popup" | "none" | "lost" | null>(null);
  const [phase, setPhase] = useState<Phase>("checking");
  const [error, setError] = useState<SignErrorKind | null>(null);
  const [requestOrigin, setRequestOrigin] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [app, setApp] = useState<App | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [walletLine, setWalletLine] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [showSignature, setShowSignature] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [referrerHost, setReferrerHost] = useState<string | null>(null);
  const restoredOriginRef = useRef<string | null>(null);
  const requestOriginRef = useRef<string | null>(null);
  const connectInFlight = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Sign in fields (074 I06)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [loginError, setLoginError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [browserLine, setBrowserLine] = useState<string | null>(null);

  const showSkeleton = useAfter(SKELETON_AFTER_MS, phase);

  // Popup check, and the Google round trip (074 I22)
  useEffect(() => {
    const returningFromGoogle = readSession(POPUP_KEY) === "true";
    restoredOriginRef.current = readSession(OPENER_KEY);
    writeSession(POPUP_KEY, null);
    writeSession(OPENER_KEY, null);
    // Before the message arrives the referrer names the asking page. Display
    // only: every check uses the SIGN_MESSAGE event origin (074 I22).
    try {
      if (document.referrer) setReferrerHost(hostOf(new URL(document.referrer).origin));
    } catch {
      // No usable referrer
    }
    if (window.opener) setOpener("popup");
    else setOpener(returningFromGoogle ? "lost" : "none");
  }, []);

  const post = useCallback((data: object) => {
    if (!window.opener) return;
    // The restored origin is only a postMessage target; trust comes from event.origin
    const target = requestOriginRef.current || restoredOriginRef.current || "*";
    try {
      window.opener.postMessage(data, target);
    } catch {
      // The opener closed or navigated away
    }
  }, []);

  const closeWindow = useCallback(() => {
    if (signature && address) post({ type: "SIGNATURE_RESULT", signature, address });
    window.close();
  }, [address, post, signature]);

  // Sign in state decides the first phase
  useEffect(() => {
    if (opener !== "popup" || authPending) return;
    if (!authUser) {
      setPhase(current => (current === "checking" ? "login" : current));
      return;
    }
    setPhase(current => {
      if (current !== "checking" && current !== "login") return current;
      if (isConnected) return "waiting";
      return BROWSER_WALLET_MODE ? "connect_browser" : "connecting";
    });
  }, [opener, authPending, authUser, isConnected]);

  // 074 I20, I24: the embedded wallet connects by itself, within 30 seconds
  const connectEmbedded = useCallback(async () => {
    if (connectInFlight.current) return;
    const status = web3Auth?.status;
    if (status === CONNECTOR_STATUS.CONNECTED || status === CONNECTOR_STATUS.CONNECTING) return;
    connectInFlight.current = true;
    try {
      const { walletToken } = await trpcClient.auth.getWalletToken.query();
      await connectTo(WALLET_CONNECTORS.AUTH, {
        authConnection: AUTH_CONNECTION.CUSTOM,
        authConnectionId: process.env.NEXT_PUBLIC_WEB3AUTH_AUTH_CONNECTION_ID,
        idToken: walletToken.token,
        extraLoginOptions: { isUserIdCaseSensitive: false },
      });
    } catch {
      setError("wallet");
    } finally {
      connectInFlight.current = false;
    }
  }, [connectTo, web3Auth]);

  useEffect(() => {
    if (phase !== "connecting" || error) return;
    void connectEmbedded();
    const timer = setTimeout(() => setError(current => current ?? "wallet"), WAIT_MS);
    return () => clearTimeout(timer);
  }, [phase, error, attempt, connectEmbedded]);

  // Connected: wait for the requesting site (074 I04: no artificial delay)
  useEffect(() => {
    if ((phase === "connecting" || phase === "connect_browser") && isConnected) {
      setPhase("waiting");
    }
  }, [phase, isConnected]);

  // 074 I05: SIGN_MESSAGE only from the opener, read within 30 seconds
  useEffect(() => {
    if (phase !== "waiting" || error) return;
    const timer = setTimeout(() => setError("timeout"), WAIT_MS);

    const onMessage = async (event: MessageEvent) => {
      if (event.source !== window.opener) return;
      if (event.data?.type !== "SIGN_MESSAGE") return;
      clearTimeout(timer);
      const origin = event.origin;
      if (!origin || origin === "null") {
        setError("origin_unknown");
        return;
      }
      let decoded: string;
      try {
        decoded = atob(String(event.data.message ?? ""));
      } catch {
        setError("unreadable");
        return;
      }
      requestOriginRef.current = origin;
      setRequestOrigin(origin);
      setMessage(decoded);
      post({ type: "SIGN_MESSAGE_RECEIVED" });
      setPhase("verifying");
    };

    window.addEventListener("message", onMessage);
    post({ type: "SIGN_READY" });
    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
    };
  }, [phase, error, attempt, post]);

  // 074 D3, I25: only enabled registered apps may ask
  useEffect(() => {
    if (phase !== "verifying" || !requestOrigin || error) return;
    let cancelled = false;
    trpcClient.oauthApps.signOrigin
      .query({ origin: requestOrigin })
      .then(result => {
        if (cancelled) return;
        if (!result.registered) {
          setError("unregistered");
          return;
        }
        setApp({ name: result.appName, icon: result.icon });
        setPhase("review");
      })
      .catch(() => {
        if (!cancelled) setError("check_failed");
      });
    return () => {
      cancelled = true;
    };
  }, [phase, requestOrigin, error, attempt]);

  // 074 I16: focus the heading on every step change
  useEffect(() => {
    headingRef.current?.focus();
  }, [phase, error]);

  const retry = () => {
    if (error === "wallet") setPhase("connecting");
    if (error === "timeout") setPhase("waiting");
    if (error === "check_failed") setPhase("verifying");
    setError(null);
    setAttempt(value => value + 1);
  };

  const submitLogin = async () => {
    setLoginError(null);
    const nextEmailError = emailSchema.safeParse(email).success
      ? undefined
      : "Enter an email like name@example.com.";
    const nextPasswordError = password ? undefined : "Enter your password.";
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) return;
    setSigningIn(true);
    try {
      const token = await executeCaptcha();
      if (isCaptchaEnabled && !token) {
        setLoginError("We could not confirm you are human. Try again.");
        return;
      }
      const response = await authClient.signIn.email({
        email,
        password,
        rememberMe: true,
        fetchOptions: { headers: token ? { "x-captcha-response": token } : undefined },
      });
      if (response?.error) {
        const kind = classifyAuthError(response.error);
        if (kind === "credentials") setPasswordError("Email or password is incorrect.");
        else if (kind === "blocked") setLoginError("This account is blocked. Contact support.");
        else setLoginError("You are not signed in. Check your connection and try again.");
      }
    } catch {
      setLoginError("You are not signed in. Check your connection and try again.");
    } finally {
      setSigningIn(false);
    }
  };

  const google = async () => {
    setLoginError(null);
    setGoogleLoading(true);
    writeSession(POPUP_KEY, "true");
    writeSession(OPENER_KEY, requestOriginRef.current || restoredOriginRef.current);
    const failure = await startGoogleSignIn({
      callbackURL: window.location.href,
      errorCallbackURL: window.location.href,
    });
    if (failure) {
      setGoogleLoading(false);
      writeSession(POPUP_KEY, null);
      setLoginError("Google sign in did not finish. Try again.");
    }
  };

  // 074 I02: browser wallet mode only
  const connectBrowserWallet = async () => {
    setBrowserLine(null);
    if (typeof window !== "undefined" && !(window as { ethereum?: unknown }).ethereum) {
      setBrowserLine("missing");
      return;
    }
    try {
      await connectAsync({ connector: injected() });
    } catch (err) {
      setBrowserLine((err as { code?: number })?.code === 4001 ? "declined" : "failed");
    }
  };

  // 074 I08, I09, I13: one commit, straight to the wallet
  const sign = async () => {
    if (!message || !agreed) return;
    setWalletLine(null);
    setPhase("signing");
    try {
      const result = await signMessageAsync({ message });
      setSignature(result);
      setPhase("done");
      post({ type: "SIGNATURE_RESULT", signature: result, address });
    } catch (err) {
      const declined = (err as { code?: number; name?: string })?.code === 4001;
      setWalletLine(declined ? "declined" : "failed");
      setPhase("review");
    }
  };

  /* ------------------------------------------------------------------ */

  if (opener === "none") {
    return (
      <CalmCard
        title="Open this from the requesting site"
        body="This page opens when a site asks you to sign with your wallet. Go back to that site and start again."
        action={
          <Button variant="ghost" asChild className="-ml-3">
            <Link href="/">Go to Amped.Bio</Link>
          </Button>
        }
      />
    );
  }
  if (opener === "lost") {
    return (
      <CalmCard
        title="Sign in finished in a new window"
        body="Close this window and start again from the requesting site."
        action={
          <Button size="lg" onClick={() => window.close()}>
            Close window
          </Button>
        }
      />
    );
  }

  const host = requestOrigin ? hostOf(requestOrigin) : null;
  const title = app?.name ?? host ?? referrerHost ?? "Sign a message";
  const current = phase === "done" ? 3 : phase === "signing" ? 2 : phase === "review" ? 1 : 0;
  const calm = phase === "review" || phase === "signing";
  const status =
    phase === "checking"
      ? "Checking your sign in"
      : phase === "connecting"
        ? "Connecting your Amped.Bio wallet"
        : phase === "waiting"
          ? `Waiting for ${host ?? "the requesting site"}`
          : phase === "verifying"
            ? `Checking ${host}`
            : phase === "signing"
              ? "Waiting for your wallet"
              : null;
  const note = BROWSER_WALLET_MODE ? SIGN_NOTE_BROWSER_WALLET : SIGN_NOTE_EMBEDDED_WALLET;

  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;

  if (error) {
    body = (
      <SignError
        kind={error}
        host={host ?? "This site"}
        onRetry={retry}
        onClose={() => window.close()}
      />
    );
  } else if (phase === "login") {
    body = (
      <section className="prism-slab space-y-[21px] p-[21px]">
        <h2 className="text-prism-panel-title text-prism-ink">Sign in to continue</h2>
        <form
          noValidate
          className="space-y-[21px]"
          onSubmit={event => {
            event.preventDefault();
            void submitLogin();
          }}
        >
          <Input
            id="sign-email"
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            error={emailError}
            onChange={event => setEmail(event.target.value)}
          />
          <PasswordInput
            id="sign-password"
            label="Password"
            autoComplete="current-password"
            value={password}
            error={passwordError}
            onChange={event => setPassword(event.target.value)}
            labelAction={
              <a
                href="/auth/reset-password"
                target="_blank"
                rel="noopener noreferrer"
                className="prism-focus -my-3 inline-flex h-touch items-center rounded-prism-8 px-1 text-prism-meta font-semibold text-prism-nav"
              >
                Forgot password
              </a>
            }
          />
          {loginError && <InlineError>{loginError}</InlineError>}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={signingIn || googleLoading}
            aria-busy={signingIn || undefined}
          >
            {signingIn ? "Signing in" : "Sign in"}
          </Button>
        </form>
        {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
          <>
            <OrDivider />
            <GoogleSignInButton
              loading={googleLoading}
              disabled={signingIn}
              onClick={() => void google()}
            />
          </>
        )}
      </section>
    );
  } else if (phase === "connect_browser") {
    body = (
      <div className="space-y-[13px]">
        <p className="text-prism-body text-prism-ink">Connect the wallet you want to sign with.</p>
        {browserLine === "declined" && (
          <p className="prism-slab p-[13px] text-prism-body text-prism-ink">
            You closed the wallet request.
          </p>
        )}
        {browserLine === "failed" && (
          <p className="prism-slab p-[13px] text-prism-meta text-prism-danger">
            Your wallet did not connect. Try again.
          </p>
        )}
        {browserLine === "missing" && (
          <Notice variant="info" title="No browser wallet found.">
            <Button variant="ghost" asChild className="-ml-3 mt-1">
              <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer">
                Get MetaMask
                <ExternalLink aria-hidden />
              </a>
            </Button>
          </Notice>
        )}
      </div>
    );
    footer = (
      <Button
        size="lg"
        className="w-full"
        disabled={browserConnecting}
        onClick={() => void connectBrowserWallet()}
      >
        {browserConnecting ? "Check your wallet" : "Connect wallet"}
      </Button>
    );
  } else if (phase === "review" || phase === "signing") {
    body = (
      <div className="space-y-[21px]">
        <div className="prism-slab">
          <SlabRow label="Requesting site">
            <p className="text-prism-label font-bold text-prism-ink">{host}</p>
            <p className="break-all text-prism-meta text-prism-ink-2">{requestOrigin}</p>
            {app && (
              <p className="mt-1 flex items-center gap-1 text-prism-meta text-prism-success">
                <BadgeCheck aria-hidden className="h-4 w-4" />
                Registered Amped.Bio app
              </p>
            )}
          </SlabRow>
          <SlabRow label="Wallet">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-prism-label font-bold text-prism-ink">
                  {BROWSER_WALLET_MODE ? "Browser wallet" : "Amped.Bio wallet"}
                </p>
                {address && (
                  <p className="text-prism-meta tabular-nums text-prism-ink-2">
                    {shortAddress(address)}
                  </p>
                )}
              </div>
              {address && <CopyButton value={address} label="Copy wallet address" />}
            </div>
          </SlabRow>
          <SlabRow label="Message">
            <pre
              aria-label="Message to sign"
              tabIndex={0}
              className="prism-focus max-h-[233px] overflow-y-auto whitespace-pre-wrap break-words font-prism text-[16px] leading-[26px] text-prism-ink"
            >
              {message}
            </pre>
          </SlabRow>
        </div>
        <Notice variant="warning" title="Only sign for sites you trust">
          Sign only if you recognize {host} and expect this request. Your signature proves you
          control this wallet.
        </Notice>
        <Checkbox checked={agreed} onCheckedChange={setAgreed} required>
          I recognize {host} and want to sign this message.
        </Checkbox>
        {walletLine === "declined" && (
          <p className="prism-slab p-[13px] text-prism-body text-prism-ink" role="status">
            You declined in your wallet. Nothing was signed.
          </p>
        )}
        {walletLine === "failed" && (
          <p className="prism-slab p-[13px] text-prism-meta text-prism-danger" role="alert">
            Your wallet did not sign. Retry, or close this window.
          </p>
        )}
      </div>
    );
    footer = (
      <div className="space-y-2">
        <Button
          variant="commit"
          size="lg"
          className="w-full"
          disabled={!agreed || phase === "signing"}
          onClick={() => void sign()}
        >
          <PenLine aria-hidden />
          {phase === "signing" ? "Check your wallet" : "Sign message"}
        </Button>
        <p className="text-center text-prism-meta text-prism-ink-2">{note}</p>
      </div>
    );
  } else if (phase === "done" && signature) {
    body = (
      <div className="space-y-[13px]">
        <p
          className="prism-slab flex items-start gap-2 p-[13px] text-prism-label text-prism-success"
          role="status"
        >
          <Check aria-hidden className="mt-px h-[21px] w-[21px] shrink-0" />
          Signed. The signature was sent to {host}.
        </p>
        <button
          type="button"
          aria-expanded={showSignature}
          aria-controls="sign-signature"
          onClick={() => setShowSignature(value => !value)}
          className="prism-focus flex h-touch w-full items-center justify-between rounded-prism-13 px-[13px] text-prism-label font-semibold text-prism-ink"
        >
          Show signature
          <ChevronDown
            aria-hidden
            className={cn(
              "h-[21px] w-[21px] transition-transform motion-reduce:transition-none",
              showSignature && "rotate-180"
            )}
          />
        </button>
        {showSignature && (
          <div id="sign-signature" className="prism-slab flex items-start gap-2 p-[13px]">
            <p className="min-w-0 flex-1 break-all text-prism-meta text-prism-ink">{signature}</p>
            <CopyButton value={signature} label="Copy signature" />
          </div>
        )}
      </div>
    );
    footer = (
      <Button size="lg" className="w-full" onClick={closeWindow}>
        Close window
      </Button>
    );
  } else {
    // checking, connecting, waiting, verifying (074 I12)
    body = showSkeleton ? (
      <div aria-hidden className="prism-slab space-y-3 p-[21px]">
        <Skeleton className="h-4 w-1/2 rounded-prism-8 motion-safe:animate-pulse" />
        <Skeleton className="h-4 w-3/4 rounded-prism-8 motion-safe:animate-pulse" />
        <Skeleton className="h-4 w-2/3 rounded-prism-8 motion-safe:animate-pulse" />
      </div>
    ) : null;
  }

  return (
    <main className="prism-room flex min-h-dvh flex-col items-center px-[21px] pb-[21px] pt-[21px] font-prism text-prism-ink">
      {/* 074 I14: whose page asks */}
      <img src="/logo.svg" alt="Amped.Bio" className="h-[34px] w-auto" />
      <section
        aria-labelledby="sign-title"
        className={cn(
          calm ? "prism-value-panel-calm" : "prism-value-panel",
          "relative mt-[21px] flex w-full max-w-[508px] flex-1 flex-col rounded-prism-34 sm:flex-none"
        )}
      >
        <header className="flex items-start gap-[13px] px-[21px] pt-[21px] sm:px-[34px] sm:pt-[34px]">
          <div className="flex h-commit w-commit shrink-0 items-center justify-center overflow-hidden rounded-prism-13 bg-[#EFE7F8]">
            {app?.icon ? (
              <img src={app.icon} alt="" className="h-full w-full object-cover" />
            ) : (
              <PenLine aria-hidden className="h-[21px] w-[21px] text-[#6E3A82]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2">
              <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-value" />
              Signature request
            </p>
            <h1
              id="sign-title"
              ref={headingRef}
              tabIndex={-1}
              className="mt-1 break-words text-prism-panel-title text-prism-ink outline-none"
            >
              {title}
            </h1>
            {requestOrigin && (
              <p className="mt-1 break-all text-prism-meta text-prism-ink-2">{requestOrigin}</p>
            )}
          </div>
        </header>
        <div className="space-y-[13px] px-[21px] pt-[21px] sm:px-[34px]">
          <StepBar steps={STEPS} current={current} />
          <p role="status" className="min-h-[16px] text-prism-meta text-prism-ink-2">
            {error ? "" : status}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-[21px] py-[13px] sm:px-[34px]">{body}</div>
        {footer && !error && (
          <footer className="sticky bottom-0 px-[21px] pb-[21px] pt-[13px] sm:px-[34px] sm:pb-[34px]">
            {footer}
          </footer>
        )}
      </section>
    </main>
  );
}
