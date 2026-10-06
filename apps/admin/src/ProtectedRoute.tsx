import { ReactNode, useEffect, useState } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button, useAuth } from "@repo/ui";

// Screen Review 081 I10: the admin gate follows the editor rules. The room
// paints at once, the admin shell skeleton after 400ms, the timeout card
// after 10 s. Signed out goes to sign in with this URL as returnTo; a
// signed in account without the admin role goes to amped.bio before any
// admin chrome renders.
const SKELETON_AFTER_MS = 400;
const TIMEOUT_MS = 10_000;

const BAR = "block rounded-prism-13 bg-prism-line motion-safe:animate-pulse";

function useAfter(ms: number) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDone(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return done;
}

function AdminShellSkeleton() {
  return (
    <div aria-busy="true" className="prism-room min-h-dvh font-prism text-prism-ink">
      <p role="status" className="sr-only">
        Loading admin
      </p>
      <div
        aria-hidden
        className="prism-dock fixed bottom-[21px] left-[21px] top-[21px] hidden w-[89px] flex-col items-center gap-2 rounded-prism-34 p-[13px] md:flex"
      >
        {Array.from({ length: 8 }).map((_, index) => (
          <span key={index} className={`${BAR} h-16 w-[61px] !rounded-[27px]`} />
        ))}
      </div>
      <div aria-hidden className="space-y-[13px] p-[13px] md:pl-[131px] md:pr-[21px] md:pt-[21px]">
        <div className="prism-glass-nav flex h-commit items-center rounded-prism-34 pl-[21px] pr-[5px]">
          <span className={`${BAR} h-5 w-[144px]`} />
          <span className="flex-1" />
          <span className={`${BAR} h-touch w-touch !rounded-full`} />
        </div>
        <div className="prism-slab overflow-hidden">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="flex h-touch items-center gap-[13px] border-b border-prism-line px-4 last:border-b-0"
            >
              <span className={`${BAR} h-3 w-1/4`} />
              <span className={`${BAR} h-3 w-1/3`} />
              <span className="flex-1" />
              <span className={`${BAR} h-3 w-[55px]`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TimeoutCard() {
  return (
    <div className="prism-room flex min-h-dvh items-center justify-center px-[13px] font-prism text-prism-ink">
      <section
        role="alert"
        className="prism-glass-clear w-full max-w-[508px] !rounded-prism-21 p-[21px] sm:p-[34px]"
      >
        <AlertCircle aria-hidden className="h-[21px] w-[21px] text-prism-danger" />
        <h1 className="mt-[13px] text-prism-panel-title text-prism-ink">
          We did not confirm your sign in
        </h1>
        <p className="mt-2 text-prism-body text-prism-ink-2">
          The server took too long to respond.
        </p>
        <Button
          type="button"
          size="lg"
          className="mt-[21px]"
          onClick={() => window.location.reload()}
        >
          <RotateCcw aria-hidden />
          Retry
        </Button>
      </section>
    </div>
  );
}

function leave(to: string) {
  window.location.replace(to);
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isPending, authUser } = useAuth();
  const showSkeleton = useAfter(SKELETON_AFTER_MS);
  const timedOut = useAfter(TIMEOUT_MS);
  const landing = import.meta.env.VITE_LANDINGPAGE_URL;
  const isAdmin = !!authUser?.role.includes("admin");

  useEffect(() => {
    document.title = isPending ? "Amped.Bio" : "Admin · Amped.Bio";
  }, [isPending]);

  useEffect(() => {
    if (isPending) return;
    if (authUser === null) {
      leave(`${landing}/login?returnTo=${encodeURIComponent(window.location.href)}`);
    } else if (!isAdmin) {
      leave(landing);
    }
  }, [isPending, authUser, isAdmin, landing]);

  if (isPending) {
    if (timedOut) return <TimeoutCard />;
    return showSkeleton ? <AdminShellSkeleton /> : <div className="prism-room min-h-dvh" />;
  }
  // Signed out or not an admin: only the room while the redirect runs
  if (!isAdmin) return <div className="prism-room min-h-dvh" />;

  return <>{children}</>;
}
