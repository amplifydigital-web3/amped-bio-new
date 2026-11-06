import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { ADULT_FAN_COPY as copy, type IdentityFailReason } from "@repo/constants";
import { StatutoryNotice, cn, trpc, useAuth } from "@repo/ui";
import { signInUrl } from "@/components/shell/ShellGate";
import {
  AUTHBASE_CONSENT_URL,
  AUTHBASE_VERIFY_URL,
} from "@/components/panels/wallet/rns/identity/catalog";

/**
 * app.amped.bio/age-check?returnTo=... : the Over 18 check sheet (identity checks
 * 4.2, boards ar1 and ar2; adult content review 9). Phone first. Six states:
 * signed out, verify, share, checking (returned from Authbase), under 18 and
 * unavailable. The Alabama warnings show in every state before a pass (C1).
 *
 * The page is not behind ProtectedRoute: a signed out fan sees the first state.
 * `returnTo` is a path on this host or a URL on the public site; anything else
 * returns to the public site's home.
 */

const LANDING = import.meta.env.VITE_LANDINGPAGE_URL ?? "https://amped.bio";
const PENDING_KEY = "amped:age-check-pending";

/** A same host path or a public site URL. Exported for tests. */
// eslint-disable-next-line react-refresh/only-export-components
export function safeReturnTo(raw: string | null, landing: string = LANDING): string {
  if (!raw) return landing;
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")) return raw;
  try {
    const url = new URL(raw);
    if (url.origin === new URL(landing).origin) return url.toString();
  } catch {
    // Not a URL
  }
  return landing;
}

type SheetState = "signed_out" | "verify" | "share" | "checking" | "under_18" | "unavailable";

/** The sheet state for a failed check (identity checks 4.2). Exported for tests. */
// eslint-disable-next-line react-refresh/only-export-components
export function stateFor(reason: IdentityFailReason): SheetState {
  switch (reason) {
    case "not_shared":
      return "share";
    case "under_18":
      return "under_18";
    case "unavailable":
      return "unavailable";
    default:
      // no_wallet, not_linked, not_verified (seller reasons never reach the age check)
      return "verify";
  }
}

function readPending(): boolean {
  try {
    return sessionStorage.getItem(PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

function writePending(on: boolean) {
  try {
    if (on) sessionStorage.setItem(PENDING_KEY, "1");
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage can be blocked; the fan taps Continue instead
  }
}

export function AgeCheckPage() {
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get("returnTo"));
  const { authUser, isPending: authPending } = useAuth();
  const [state, setState] = useState<SheetState | null>(null);
  const leaving = useRef(false);

  const checks = useQuery({
    ...trpc.identity.myChecks.queryOptions(),
    enabled: !!authUser,
    retry: false,
  });

  const open = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    writePending(false);
    window.location.assign(returnTo);
  }, [returnTo]);

  const recheck = useMutation(
    trpc.identity.recheck.mutationOptions({
      onMutate: () => setState("checking"),
      onSuccess: result => {
        if (result.pass) open();
        else setState(stateFor(result.reason));
      },
      onError: () => setState("unavailable"),
    })
  );
  const runRecheck = recheck.mutate;

  // First read: the stored result, or a fresh check when the fan comes back from Authbase
  useEffect(() => {
    if (authPending) return;
    if (!authUser) {
      setState("signed_out");
      return;
    }
    if (readPending()) {
      runRecheck({ kind: "age_over_18" });
      return;
    }
    if (checks.isError) setState("unavailable");
    if (!checks.data) return;
    const age = checks.data.ageOver18;
    if (age.pass) open();
    else setState(stateFor(age.reason));
  }, [authPending, authUser, checks.data, checks.isError, open, runRecheck]);

  // Back from the Authbase tab: check again without a second tap
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && readPending() && authUser) {
        runRecheck({ kind: "age_over_18" });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [authUser, runRecheck]);

  const toAuthbase = (href: string | undefined) => () => {
    if (!href) {
      setState("unavailable");
      return;
    }
    writePending(true);
    window.open(href, "_blank", "noopener");
  };

  const shown = state ?? "checking";
  let body: string = copy.checking;
  let action: React.ReactNode = null;
  switch (shown) {
    case "signed_out":
      body = copy.signedOut;
      action = <SheetLink href={signInUrl(window.location.href)}>{copy.signIn}</SheetLink>;
      break;
    case "verify":
      body = copy.verify;
      action = (
        <>
          <SheetAction onClick={toAuthbase(AUTHBASE_VERIFY_URL)}>{copy.verifyAction}</SheetAction>
          <SheetAction variant="secondary" onClick={() => runRecheck({ kind: "age_over_18" })}>
            {copy.continue}
          </SheetAction>
        </>
      );
      break;
    case "share":
      body = copy.share;
      action = (
        <>
          <SheetAction onClick={toAuthbase(AUTHBASE_CONSENT_URL)}>{copy.shareAction}</SheetAction>
          <SheetAction variant="secondary" onClick={() => runRecheck({ kind: "age_over_18" })}>
            {copy.continue}
          </SheetAction>
        </>
      );
      break;
    case "under_18":
      // No retry prompt (identity checks 4.2 and 4.5)
      body = copy.under18;
      action = <SheetLink href={LANDING}>{copy.close}</SheetLink>;
      break;
    case "unavailable":
      body = copy.unavailable;
      action = (
        <SheetAction onClick={() => runRecheck({ kind: "age_over_18" })}>
          {copy.tryAgain}
        </SheetAction>
      );
      break;
    case "checking":
      break;
  }

  return (
    <div className="prism-room min-h-dvh px-4 py-[21px] md:py-[55px]">
      <main
        aria-labelledby="age-check-title"
        className="mx-auto flex w-full max-w-[420px] flex-col gap-[21px] rounded-prism-21 bg-white p-[21px] text-[#16152B] shadow-[0_21px_55px_rgba(22,21,43,0.18)]"
      >
        <header className="flex items-center gap-3">
          <ShieldCheck aria-hidden className="h-[26px] w-[26px] shrink-0" />
          <h1 id="age-check-title" className="text-[20px] font-bold leading-[26px]">
            {copy.sheetTitle}
          </h1>
        </header>
        <div
          role={shown === "checking" ? "status" : undefined}
          className="flex flex-col gap-[13px]"
        >
          <p className="flex items-center gap-2 text-[17px] leading-6">
            {shown === "checking" && (
              <Loader2 aria-hidden className="h-5 w-5 animate-spin motion-reduce:animate-none" />
            )}
            {body}
          </p>
          {action && <div className="flex flex-col gap-[8px]">{action}</div>}
        </div>
        {/* Section 9(a)(1): in every state a viewer sees before the check passes */}
        <StatutoryNotice kind="warnings" />
      </main>
    </div>
  );
}

const ACTION =
  "inline-flex min-h-[55px] w-full items-center justify-center rounded-prism-13 border-2 border-[#16152B] px-4 text-[17px] font-semibold outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16152B]";

function SheetAction({
  children,
  onClick,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(ACTION, variant === "primary" ? "bg-[#16152B] text-white" : "bg-transparent")}
    >
      {children}
    </button>
  );
}

function SheetLink({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <a href={href} className={cn(ACTION, "bg-[#16152B] text-white")}>
      {children}
    </a>
  );
}
