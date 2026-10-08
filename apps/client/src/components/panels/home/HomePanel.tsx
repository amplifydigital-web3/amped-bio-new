import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { trpc, useAuth } from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { useDelayed } from "@/hooks/useDelayed";
import { FAN_GRAPH } from "@/components/shell/pageVisibility";
import { PublishPageSheet } from "@/components/shell/PublishPageSheet";
import { HOME_UPDATES_FRAME } from "./homeContent";
import { MakeYourPageCard } from "./MakeYourPageCard";
import { PageStatusCard, PageStatusError, PageStatusSkeleton } from "./PageStatusCard";
import { SetupChecklist, SetupChecklistError, SetupChecklistSkeleton } from "./SetupChecklist";
import { NetworkSection, TestnetCard } from "./TestnetCard";
import { UpdatesFrame } from "./UpdatesFrame";
import { VerifyEmailNotice } from "./VerifyEmailNotice";
import { VideoGuides } from "./VideoGuides";

// Page details that have not loaded by then show the error card (016 I13)
const PROFILE_TIMEOUT_MS = 10_000;

// Moves focus to the visible top bar title on arrival (015 I13)
function focusShellTitle() {
  const titles = document.querySelectorAll<HTMLElement>("[data-shell-title]");
  const visible = Array.from(titles).find(title => title.offsetParent !== null);
  visible?.focus({ preventScroll: true });
}

/**
 * Home (Screen Review 015, 016). Native, on the D08 grid without a preview.
 * Left column: the setup checklist on first run (015), then the page status
 * card. Right column: the testnet compliance card, Network rows and Video
 * guides. The Updates frame (D2) sits last in the left column and last in the
 * DOM, so it is last in the tab order. Mobile stacks one column: notices,
 * checklist, page status, testnet, video guides, Network, Updates.
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
  const { authUser } = useAuth();
  const { profile, setUser } = useEditor();
  const profileLoaded = !!profile.handle;
  const showProfileSkeleton = useDelayed(!profileLoaded, 400);
  const [profileFailed, setProfileFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    if (profileLoaded) {
      setProfileFailed(false);
      return;
    }
    const timer = setTimeout(() => setProfileFailed(true), PROFILE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [profileLoaded]);
  const retryProfile = async () => {
    if (!authUser?.handle || retrying) return;
    setRetrying(true);
    const result = await setUser(authUser.handle);
    setRetrying(false);
    setProfileFailed(!result);
  };
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
  // QA-008: an unpublished page gets the Make your own page card, not the checklist
  const unpublished = FAN_GRAPH && data?.pageStatus === "UNPUBLISHED";
  const [publishOpen, setPublishOpen] = useState(false);
  // The checklist retires once completed; the complete state shows on the visit that finished it
  const showChecklist =
    !!data &&
    !unpublished &&
    !data.dismissed &&
    (!data.completed || sawComplete || data.justCompleted);
  const canRestore = !!data && !unpublished && data.dismissed && !data.completed;

  const restoreChecklist = () => restore.mutate({ moment: "checklistDismissed", clear: true });

  return (
    <div className="flex flex-col gap-[21px] px-4 pb-6 pt-5 font-prism md:px-6">
      {data && !data.emailVerified && data.email && <VerifyEmailNotice email={data.email} />}

      <div className="grid gap-[21px] lg:grid-cols-[minmax(0,759fr)_minmax(0,508fr)] lg:gap-x-[21px] lg:gap-y-[34px]">
        <div className="prism-stagger flex min-w-0 flex-col gap-[21px] lg:col-start-1 lg:row-start-1">
          {status.isPending && showSkeleton && <SetupChecklistSkeleton />}
          {status.isError && <SetupChecklistError onRetry={() => void status.refetch()} />}
          {showChecklist && <SetupChecklist status={data} welcome={welcome} />}
          {unpublished && data && !data.publishCardDismissed && (
            <MakeYourPageCard onPublish={() => setPublishOpen(true)} />
          )}

          {profileLoaded ? (
            <PageStatusCard
              handle={profile.handle}
              name={profile.name}
              photoUrl={profile.photoUrl}
              onShowChecklist={canRestore ? restoreChecklist : undefined}
              restoring={restore.isPending}
              unpublished={unpublished}
            />
          ) : profileFailed ? (
            <PageStatusError onRetry={() => void retryProfile()} retrying={retrying} />
          ) : (
            showProfileSkeleton && <PageStatusSkeleton />
          )}
        </div>

        {/* Static: always renders, even with the API blocked (016 I13) */}
        <div className="prism-stagger flex min-w-0 flex-col gap-[34px] lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <TestnetCard />
          <NetworkSection className="hidden lg:block" />
          <VideoGuides />
          <NetworkSection className="lg:hidden" />
        </div>

        {HOME_UPDATES_FRAME && (
          <UpdatesFrame className="min-w-0 lg:col-start-1 lg:row-start-2 lg:self-start" />
        )}
      </div>

      {FAN_GRAPH && <PublishPageSheet open={publishOpen} onOpenChange={setPublishOpen} />}
    </div>
  );
}
