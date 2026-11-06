import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { trpc, useAuth } from "@repo/ui";
import { MerchantContext } from "./merchant";

const LANDING = import.meta.env.VITE_LANDINGPAGE_URL;

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="prism-room flex min-h-dvh items-center justify-center px-[16px] font-prism text-prism-ink">
      <section
        role="alert"
        className="prism-glass-clear w-full max-w-[508px] !rounded-prism-21 p-[21px] sm:p-[34px]"
      >
        <AlertCircle aria-hidden className="h-[21px] w-[21px] text-prism-nav" />
        <h1 className="mt-[13px] text-prism-panel-title text-prism-ink">{title}</h1>
        <p className="mt-2 text-prism-body text-prism-ink-2">{body}</p>
      </section>
    </div>
  );
}

/** Signed out goes to sign in; an account that is not a merchant member sees the no access card. */
export function ConsoleGate({ children }: { children: ReactNode }) {
  const { isPending, authUser } = useAuth();
  const mine = useQuery({ ...trpc.merchant.mine.queryOptions(), enabled: Boolean(authUser) });

  useEffect(() => {
    document.title = "Merchant Console · Amped.Bio";
    if (!isPending && authUser === null) {
      window.location.replace(
        `${LANDING}/login?returnTo=${encodeURIComponent(window.location.href)}`
      );
    }
  }, [isPending, authUser]);

  if (isPending || !authUser || mine.isPending) {
    return (
      <div aria-busy="true" className="prism-room min-h-dvh">
        <p role="status" className="sr-only">
          Loading the Merchant Console
        </p>
      </div>
    );
  }
  if (mine.isError) return <Card title="The console did not load" body="Try again in a minute." />;
  const merchant = mine.data[0];
  if (!merchant) {
    return (
      <Card
        title="This account is not on a merchant team"
        body="Ask an Owner of your business to add you, or contact Amped.Bio support."
      />
    );
  }
  return <MerchantContext.Provider value={merchant}>{children}</MerchantContext.Provider>;
}
