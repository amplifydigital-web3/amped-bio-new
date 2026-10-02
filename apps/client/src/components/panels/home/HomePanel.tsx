import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Button, trpc } from "@repo/ui";
import { useDelayed } from "@/hooks/useDelayed";
import { SetupChecklist, SetupChecklistError, SetupChecklistSkeleton } from "./SetupChecklist";
import { VerifyEmailNotice } from "./VerifyEmailNotice";

// Moves focus to the visible top bar title on arrival (015 I13)
function focusShellTitle() {
  const titles = document.querySelectorAll<HTMLElement>("[data-shell-title]");
  const visible = Array.from(titles).find(title => title.offsetParent !== null);
  visible?.focus({ preventScroll: true });
}

/**
 * Home (Screen Review 015). New accounts arrive at /home?welcome=1 and see the
 * setup checklist as the first object, under the verify email notice while the
 * email is unverified. The onboarding page below stays until row 016 replaces
 * it with the page status and testnet cards.
 */
export function HomePanel() {
  const [params, setParams] = useSearchParams();
  const [welcome] = useState(() => params.get("welcome") === "1");
  const queryClient = useQueryClient();
  const status = useQuery(trpc.onboarding.status.queryOptions());
  const showSkeleton = useDelayed(status.isPending, 400);
  const restore = useMutation(
    trpc.onboarding.mark.mutationOptions({
      onSuccess: next => queryClient.setQueryData(trpc.onboarding.status.queryKey(), next),
    })
  );
  const focused = useRef(false);
  // Keep the complete state for the rest of the visit that finished the last step
  const [sawComplete, setSawComplete] = useState(false);
  useEffect(() => {
    if (status.data?.justCompleted) setSawComplete(true);
  }, [status.data?.justCompleted]);

  // Read the welcome flag once, then drop it so a reload is a normal visit (015 I01)
  useEffect(() => {
    if (!params.has("welcome")) return;
    setParams(
      current => {
        const next = new URLSearchParams(current);
        next.delete("welcome");
        return next;
      },
      { replace: true }
    );
  }, [params, setParams]);

  useEffect(() => {
    if (focused.current) return;
    focused.current = true;
    focusShellTitle();
  }, []);

  const data = status.data;
  // The checklist retires once completed; the complete state shows on the visit that finished it
  const showChecklist =
    !!data && !data.dismissed && (!data.completed || sawComplete || data.justCompleted);
  const canRestore = !!data && data.dismissed && !data.completed;

  return (
    <div className="flex flex-col gap-[21px] font-prism">
      {data && !data.emailVerified && data.email && <VerifyEmailNotice email={data.email} />}

      <div className="grid gap-[21px] lg:grid-cols-[minmax(0,759fr)_minmax(0,508fr)]">
        <div className="min-w-0">
          {status.isPending && showSkeleton && <SetupChecklistSkeleton />}
          {status.isError && <SetupChecklistError onRetry={() => void status.refetch()} />}
          {showChecklist && <SetupChecklist status={data} welcome={welcome} />}
          {/* Until row 016 adds the page status card, restore lives here (015 I09) */}
          {canRestore && (
            <Button
              variant="ghost"
              disabled={restore.isPending}
              onClick={() => restore.mutate({ moment: "checklistDismissed", clear: true })}
            >
              Show setup checklist
            </Button>
          )}
        </div>
      </div>

      <div className="min-w-0 overflow-hidden rounded-prism-21 bg-white shadow-prism-e3">
        <iframe
          src="https://onboarding.ampedbio.com/"
          title="Amped Bio Onboarding"
          className="block h-[calc(100dvh-89px)] w-full"
          style={{ border: "none" }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}
