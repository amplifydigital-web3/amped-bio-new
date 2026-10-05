"use client";

import { Suspense, use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Check, Clock, LoaderCircle } from "lucide-react";
import { AuthCard, AuthCardSkeleton, AuthLegalLine, Button, StatusDisc } from "@repo/ui";
import { authClient } from "@/lib/auth-client";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { PRIVACY_POLICY_URL } from "@/components/layout/PublicFooter";
import { useDelayed } from "@/hooks/useDelayed";
import { getPanelHomeUrl } from "@/lib/panel";

type Failure = "expired" | "invalid" | "incomplete";
type State =
  | { kind: "verifying" }
  | { kind: "verified"; signedIn: boolean }
  | { kind: "failed"; cause: Failure };

const FAILURE_COPY: Record<Failure, { title: string; body: string }> = {
  expired: {
    title: "This link has expired",
    body: "Links work for one hour. Send a new one and use it within the hour.",
  },
  invalid: {
    title: "This link does not work",
    body: "It may have been used already or copied incompletely.",
  },
  incomplete: {
    title: "This link is incomplete",
    body: "Open the link from your email again, or send a new one.",
  },
};

// Error codes from better-auth or the old redirect params, in words (011 I06).
// The raw error goes to the console only.
function toFailure(code: string | null | undefined): Failure {
  if (!code) return "invalid";
  if (/expired/i.test(code)) return "expired";
  if (/emailMissing|missing/i.test(code)) return "incomplete";
  return "invalid";
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
  }, []);
  return reduced;
}

// Verify email (Screen Review 011): one status card in the shared auth card.
// Verifying after 400ms, Verified with Open editor, or Failed by cause with
// Send a new link.
function VerifyEmail({ token }: { token: string }) {
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const [state, setState] = useState<State>({ kind: "verifying" });
  const showVerifying = useDelayed(state.kind === "verifying", 400);
  const reducedMotion = useReducedMotion();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const statusParam = params.get("status");
    const errorParam = params.get("error");
    const finishVerified = async () => {
      // Verification signs the person in (autoSignInAfterVerification)
      const session = await authClient.getSession().catch(() => null);
      setState({ kind: "verified", signedIn: !!session?.data?.user });
    };

    if (statusParam === "success") return void finishVerified();
    if (errorParam) {
      console.error("Email verification failed:", errorParam);
      return setState({ kind: "failed", cause: toFailure(errorParam) });
    }
    if (!token || !email) return setState({ kind: "failed", cause: "incomplete" });

    authClient
      .verifyEmail({ query: { token } })
      .then(response => {
        if (response.data?.status) return finishVerified();
        console.error("Email verification failed:", response.error);
        setState({ kind: "failed", cause: toFailure(response.error?.code) });
      })
      .catch(error => {
        console.error("Email verification failed:", error);
        setState({ kind: "failed", cause: "invalid" });
      });
  }, [token, email, params]);

  // Results move focus to their title (011 I04)
  useEffect(() => {
    if (state.kind !== "verifying") titleRef.current?.focus();
  }, [state.kind]);

  const legal = <AuthLegalLine privacyHref={PRIVACY_POLICY_URL} />;

  if (state.kind === "verifying") {
    if (!showVerifying) return null;
    return (
      <AuthCard title="Verify your email" footer={legal}>
        <p role="status" className="flex items-center gap-2 text-prism-body text-prism-ink-2">
          {reducedMotion ? (
            <Clock className="h-[21px] w-[21px] text-prism-nav" aria-hidden />
          ) : (
            <LoaderCircle className="h-[21px] w-[21px] animate-spin text-prism-nav" aria-hidden />
          )}
          Verifying your email
        </p>
      </AuthCard>
    );
  }

  if (state.kind === "verified") {
    const signInHref = `/login${email ? `?email=${encodeURIComponent(email)}` : ""}`;
    return (
      <AuthCard
        centered
        status
        titleRef={titleRef}
        icon={<StatusDisc icon={Check} tone="success" />}
        title="Email verified"
        subtitle={email ? `${email} is confirmed.` : "Your email is confirmed."}
        footer={legal}
      >
        <div className="pt-[13px]">
          {state.signedIn ? (
            <Button size="lg" className="w-full" asChild>
              <a href={getPanelHomeUrl({ welcome: true })}>Open editor</a>
            </Button>
          ) : (
            <Button size="lg" className="w-full" asChild>
              <Link href={signInHref}>Sign in</Link>
            </Button>
          )}
        </div>
      </AuthCard>
    );
  }

  const copy = FAILURE_COPY[state.cause];
  return (
    <AuthCard
      centered
      status
      titleRef={titleRef}
      icon={<StatusDisc icon={AlertCircle} tone="danger" />}
      title={copy.title}
      subtitle={copy.body}
      footer={legal}
    >
      <div className="space-y-[13px] pt-[13px]">
        <Button size="lg" className="w-full" asChild>
          <Link
            href={`/auth/resend-verification${email ? `?email=${encodeURIComponent(email)}` : ""}`}
          >
            Send a new link
          </Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    </AuthCard>
  );
}

function CardFallback() {
  const show = useDelayed(true, 400);
  return show ? <AuthCardSkeleton /> : null;
}

export default function EmailVerificationPage({
  params,
}: {
  params: Promise<{ token?: string[] }>;
}) {
  const { token: tokenArray } = use(params);
  const token = (tokenArray || []).join("/");

  return (
    <AuthLayout>
      <Suspense fallback={<CardFallback />}>
        <VerifyEmail token={token} />
      </Suspense>
    </AuthLayout>
  );
}
