import { useRef } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Circle } from "lucide-react";
import {
  Button,
  DrawnCheck,
  ErrorCard,
  SuccessMoment,
  cn,
  trpc,
  type RouterOutputs,
} from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { publicPageUrl } from "@/components/shell/pageLink";

type Status = RouterOutputs["onboarding"]["status"];
type StepKey = keyof Status["steps"];

const STEP_ORDER: StepKey[] = ["url", "photo", "block", "theme", "share"];

const pageHost = (() => {
  try {
    return new URL(import.meta.env.VITE_LANDINGPAGE_URL).host;
  } catch {
    return "amped.bio";
  }
})();

// Setup checklist (Screen Review 015 I04 to I10): the one G3 prism lens of the
// context field during first run. Five rows in visitor value order, each a
// link into the exact tool, and one primary that names the next step.
export function SetupChecklist({ status, welcome }: { status: Status; welcome: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const statusKey = trpc.onboarding.status.queryKey();
  const mark = useMutation(
    trpc.onboarding.mark.mutationOptions({
      onSuccess: next => queryClient.setQueryData(statusKey, next),
    })
  );

  const handle = status.handle;
  const pageAddress = `${pageHost}/${handle}`;
  const doneCount = STEP_ORDER.filter(key => status.steps[key]).length;
  // Steps open at first render, so a step that completes later can play its check
  const openAtStart = useRef(new Set(STEP_ORDER.filter(key => !status.steps[key])));
  const justDone = new Set(
    STEP_ORDER.filter(key => status.steps[key] && openAtStart.current.has(key))
  );
  const current = STEP_ORDER.find(key => !status.steps[key]);

  const share = async () => {
    const url = publicPageUrl(handle);
    const touch = window.matchMedia("(pointer: coarse)").matches;
    try {
      if (touch && navigator.share) {
        await navigator.share({ url, title: "My Amped.Bio page" });
      } else {
        await navigator.clipboard.writeText(url);
        toast.add({ type: "success", title: "Link copied" });
      }
      mark.mutate({ moment: "shared" });
    } catch (error) {
      // A closed share sheet is not a failure
      if ((error as Error)?.name === "AbortError") return;
      toast.add({ type: "error", title: "Could not copy the link" });
    }
  };

  const steps: Record<
    StepKey,
    { label: string; helper: string; primary: string; run: () => void }
  > = {
    url: {
      label: "Choose your URL",
      helper: pageAddress,
      primary: `Keep ${pageAddress}`,
      run: () => navigate("/account?open=url"),
    },
    photo: {
      label: "Add a photo",
      helper: "Fans see it first on your page.",
      primary: "Add a photo",
      run: () => navigate("/page?open=photo"),
    },
    block: {
      label: "Add your first block",
      helper: "A link, video, music or text.",
      primary: "Add your first block",
      run: () => navigate("/page?open=add-block"),
    },
    theme: {
      label: "Pick a theme",
      helper: "Colors, fonts and buttons in one choice.",
      primary: "Pick a theme",
      run: () => navigate("/design?tab=themes"),
    },
    share: {
      label: "Share your page",
      helper: "Put it in your Instagram, TikTok and X bios.",
      primary: "Copy page link",
      run: () => void share(),
    },
  };

  const hide = () => {
    mark.mutate({ moment: "checklistDismissed" });
    toast.add({
      type: "info",
      title: "Checklist hidden",
      duration: 8000,
      actionProps: {
        children: "Undo",
        onClick: () => mark.mutate({ moment: "checklistDismissed", clear: true }),
      },
    });
  };

  // Complete: the lens drops its rim and halo; from the next visit it is gone
  if (!current) {
    return (
      <section
        aria-labelledby="setup-title"
        className="prism-glass-clear rounded-prism-21 p-[21px] text-center font-prism sm:p-[34px]"
      >
        {/* Prism success moment: the rim draws, then the check (#26, section 3.4) */}
        <div className="flex justify-center">
          <SuccessMoment label="Setup complete" />
        </div>
        <h2 id="setup-title" className="mt-[21px] text-prism-panel-title text-prism-ink">
          Your page is set up
        </h2>
        <p className="mt-2 text-prism-body text-prism-ink-2">Share it wherever your fans are.</p>
        <Button variant="secondary" className="mt-[21px]" asChild>
          <a href={publicPageUrl(handle)} target="_blank" rel="noopener noreferrer">
            View page
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </Button>
      </section>
    );
  }

  return (
    // The halo sits behind the lens, not inside it, so text stays on the clear lens
    <section aria-labelledby="setup-title" className="relative isolate">
      <span aria-hidden className="prism-halo-card" />
      <div className="prism-lens relative rounded-prism-21 p-2">
        <span aria-hidden className="prism-rim" />
        <div className="relative p-[13px] font-prism sm:p-[21px]">
          <div className="flex items-start justify-between gap-3">
            <h2 id="setup-title" className="pt-[10px] text-prism-panel-title text-prism-ink">
              Set up your page
            </h2>
            <Button variant="ghost" onClick={hide} disabled={mark.isPending}>
              Hide checklist
            </Button>
          </div>
          {welcome && (
            <p className="mt-2 text-prism-body text-prism-ink-2">
              Welcome, @{handle}. Your page is already live at {pageAddress}.
            </p>
          )}

          {/* Progress (015 I05) */}
          <p aria-live="polite" className="mt-[21px] text-prism-meta tabular-nums text-prism-ink-2">
            {doneCount} of {STEP_ORDER.length} done
          </p>
          <div aria-hidden className="mt-2 flex gap-[5px]">
            {STEP_ORDER.map(key => (
              <span
                key={key}
                className={cn(
                  "h-[3px] flex-1 rounded-full transition-[background-color,box-shadow] duration-prism-panel ease-prism",
                  status.steps[key]
                    ? "bg-prism-success"
                    : key === current
                      ? "bg-prism-nav shadow-[0_0_8px_rgba(86,80,162,0.45)]"
                      : "bg-prism-line-strong"
                )}
              />
            ))}
          </div>

          {/* Rows (015 I06) */}
          <ul className="mt-[13px]">
            {STEP_ORDER.map(key => {
              const step = steps[key];
              const done = status.steps[key];
              return (
                <li key={key} className="border-b border-prism-line last:border-b-0">
                  <button
                    type="button"
                    onClick={step.run}
                    className="prism-focus flex min-h-commit w-full items-center gap-3 rounded-prism-13 py-2 text-left"
                  >
                    {done ? (
                      // A step finished during this visit draws its check (233 ms)
                      <DrawnCheck play={justDone.has(key)} className="text-prism-success" />
                    ) : (
                      <Circle
                        className={cn(
                          "h-[21px] w-[21px] shrink-0",
                          key === current ? "text-prism-nav" : "text-[rgba(22,21,43,0.4)]"
                        )}
                        strokeWidth={1.5}
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-prism-label font-semibold text-prism-ink">
                        {step.label}
                        <span className="sr-only">{done ? ", done" : ", to do"}</span>
                      </span>
                      <span className="block truncate text-prism-meta text-prism-ink-2">
                        {step.helper}
                      </span>
                    </span>
                    <ChevronRight
                      className="h-[21px] w-[21px] shrink-0 text-prism-ink-2"
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </ul>

          {/* One primary names the next step (015 I07) */}
          <div className="mt-[21px] flex flex-col gap-[13px] sm:flex-row">
            <Button
              size="lg"
              className="w-full sm:flex-1"
              disabled={mark.isPending}
              onClick={() =>
                current === "url" ? mark.mutate({ moment: "urlConfirmed" }) : steps[current].run()
              }
            >
              {steps[current].primary}
            </Button>
            {current === "url" && (
              <Button variant="secondary" className="w-full sm:w-auto" onClick={steps.url.run}>
                Change URL
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// Five 55 skeleton rows in the lens while the record loads (015 I12)
export function SetupChecklistSkeleton() {
  return (
    <div aria-hidden className="prism-glass-clear space-y-3 rounded-prism-21 p-[21px]">
      <span className="block h-5 w-40 rounded-prism-13 bg-prism-line" />
      {Array.from({ length: 5 }).map((_, index) => (
        <span key={index} className="block h-commit w-full rounded-prism-13 bg-prism-line" />
      ))}
    </div>
  );
}

export function SetupChecklistError({ onRetry }: { onRetry: () => void }) {
  return (
    <ErrorCard
      title="Setup checklist did not load"
      cause="Check your connection and try again."
      onRetry={onRetry}
      retryLabel="Retry"
    />
  );
}
