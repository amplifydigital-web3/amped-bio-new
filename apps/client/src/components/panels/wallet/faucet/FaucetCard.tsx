import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { AlertCircle, ArrowRight, Check, Droplet, Info, PlayCircle } from "lucide-react";
import { Button, ErrorCard, Notice, Skeleton, TESTNET_NOTICE, cn } from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { useDelayed } from "@/hooks/useDelayed";
import { toast } from "@/components/ui/toast";
import { VideoPlayerDialog, type PlayerVideo } from "../../home/VideoPlayerDialog";
import { useFaucet, type FaucetRequirements } from "./useFaucet";

// 053 approved wording (D1 answered, Rob 30 Sep)
const CONVERSION_NOTE = "Planned to convert 1:1 to REVO at mainnet. Not guaranteed.";
const WATCH_HOW: PlayerVideo = { id: "j_TED4IA4bc", title: "Get testnet tREVO from the faucet" };
const MIN_BLOCKS = 5;

type StepKey = keyof FaucetRequirements;

// 053 I05, I06 with the approved label order. Each action opens the exact control.
const STEPS: { key: StepKey; label: string; action: string; to: string }[] = [
  { key: "photo", label: "Profile photo", action: "Add photo", to: "/page?open=photo" },
  {
    key: "background",
    label: "Background",
    action: "Set background",
    to: "/design?tab=style&open=background",
  },
  { key: "bio", label: "Bio", action: "Write bio", to: "/page?open=bio" },
  { key: "minLinks", label: "5 or more blocks", action: "Add blocks", to: "/page?open=add-block" },
];

function formatAmount(amount: number | null) {
  return amount === null ? "" : amount.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function countdown(target: Date, now: number) {
  const left = Math.max(0, target.getTime() - now);
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** 053 I09: the cooldown line, updated every second, announced once a minute. */
function Cooldown({ until, onDone }: { until: Date; onDone: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const done = now >= until.getTime();
  useEffect(() => {
    if (done) onDone();
  }, [done, onDone]);
  const minuteText = `You can get more in ${countdown(until, Math.floor(now / 60_000) * 60_000).slice(0, 5)}.`;
  return (
    <div>
      <p aria-hidden className="text-prism-label font-semibold tabular-nums text-prism-ink">
        You can get more in {countdown(until, now)}.
      </p>
      <p className="sr-only" aria-live="polite">
        {minuteText}
      </p>
    </div>
  );
}

function StepStatus({ done }: { done: boolean }) {
  return done ? (
    <span
      aria-hidden
      className="flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full bg-prism-success"
    >
      <Check className="h-[13px] w-[13px] text-white" strokeWidth={3} />
    </span>
  ) : (
    <span
      aria-hidden
      className="h-[21px] w-[21px] shrink-0 rounded-full shadow-[inset_0_0_0_1.5px_rgba(22,21,43,0.4)]"
    />
  );
}

function Notes() {
  return (
    <div className="space-y-2 border-t border-prism-line pt-[21px]">
      {[CONVERSION_NOTE, TESTNET_NOTICE].map(line => (
        <p key={line} className="flex items-start gap-2 text-prism-meta text-prism-ink-2">
          <Info className="h-[21px] w-[21px] shrink-0 text-prism-nav" aria-hidden />
          <span className="pt-0.5">{line}</span>
        </p>
      ))}
    </div>
  );
}

function FaucetSkeleton() {
  return (
    <div
      aria-busy
      aria-label="Loading the testnet faucet"
      className="prism-glass-clear space-y-[13px] !rounded-prism-21 p-[21px] sm:p-[34px]"
    >
      <Skeleton className="h-5 w-[144px] rounded-prism-5" />
      <Skeleton className="h-4 w-4/5 rounded-prism-5" />
      <Skeleton className="h-[3px] w-full rounded-full" />
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-[55px] w-full rounded-prism-13" />
      ))}
      <Skeleton className="h-commit w-full rounded-prism-13" />
    </div>
  );
}

/**
 * Screen Review 053. The Testnet faucet card in the Get tREVO section (D19).
 * The page steps checklist sits inline; the request control moved here from
 * the Fund dialog. One card carries every request state: setup, ready,
 * sending, sent, cooldown, paused, empty, did not load and loading.
 */
export default function FaucetCard() {
  const faucet = useFaucet();
  const navigate = useNavigate();
  const { blocks } = useEditor();
  const titleId = useId();
  const helperId = useId();
  const errorId = useId();
  const [video, setVideo] = useState<PlayerVideo | null>(null);
  const watchRef = useRef<HTMLButtonElement>(null);
  const showSkeleton = useDelayed(faucet.state === "loading", 400);

  if (faucet.state === "loading") return showSkeleton ? <FaucetSkeleton /> : null;

  if (faucet.state === "error") {
    return (
      <div id="faucet">
        <ErrorCard
          title="Testnet faucet"
          cause="We could not reach the faucet."
          retryLabel="Retry"
          onRetry={faucet.retry}
          className="!rounded-prism-21"
        />
      </div>
    );
  }

  const amount = formatAmount(faucet.amount);
  const requirements = faucet.requirements!;
  const allDone = faucet.doneCount === 4;
  const nextStep = STEPS.find(step => !requirements[step.key]);
  const blockCount = blocks?.length ?? 0;

  const describe = (key: StepKey, done: boolean) => {
    if (done) return "Added";
    if (key === "minLinks") return `${Math.min(blockCount, MIN_BLOCKS)} of ${MIN_BLOCKS} added`;
    return "Not set yet";
  };

  const submit = async () => {
    const ok = await faucet.request();
    // 053 I10: the toast is never the only confirmation; the card shows Request sent
    if (ok) {
      toast.add({
        type: "info",
        title: `Request sent. ${amount} tREVO arrives in your wallet within a few hours.`,
      });
    }
  };

  let control: React.ReactNode;
  switch (faucet.state) {
    case "setup":
      control = (
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="w-full"
          aria-describedby={helperId}
          onClick={() => nextStep && navigate(nextStep.to)}
        >
          Finish setup
          <ArrowRight aria-hidden />
        </Button>
      );
      break;
    case "ready":
    case "sending":
      control = (
        <div className="space-y-2">
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={faucet.state === "sending"}
            aria-busy={faucet.state === "sending"}
            aria-describedby={faucet.requestError ? errorId : undefined}
            onClick={() => void submit()}
          >
            {faucet.state === "sending" ? (
              <span
                aria-hidden
                className="h-[21px] w-[21px] animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none"
              />
            ) : (
              <Droplet aria-hidden />
            )}
            {faucet.state === "sending" ? "Sending request" : `Get ${amount} tREVO`}
          </Button>
          {faucet.requestError && (
            <p id={errorId} className="flex items-start gap-2 text-prism-meta text-prism-danger">
              <AlertCircle className="h-[21px] w-[21px] shrink-0" aria-hidden />
              <span className="pt-0.5">{faucet.requestError}</span>
            </p>
          )}
        </div>
      );
      break;
    case "sent":
      control = (
        <div className="space-y-[13px]">
          <Notice variant="info" role="status">
            <p>Request sent. tREVO arrives in your wallet within a few hours.</p>
          </Notice>
          <Button type="button" variant="secondary" size="lg" className="w-full" disabled>
            Requested
          </Button>
        </div>
      );
      break;
    case "cooldown":
      control = faucet.nextAvailable ? (
        <Cooldown until={faucet.nextAvailable} onDone={faucet.retry} />
      ) : null;
      break;
    case "paused":
      control = (
        <Notice variant="info">
          <p>The faucet is paused. Try again later.</p>
        </Notice>
      );
      break;
    case "empty":
      control = (
        <Notice variant="info">
          <p>The faucet is empty right now. Try again later.</p>
        </Notice>
      );
      break;
  }

  return (
    <article
      id="faucet"
      aria-labelledby={titleId}
      className="prism-glass-clear flex flex-col gap-[21px] !rounded-prism-21 p-[21px] font-prism sm:p-[34px]"
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h3 id={titleId} className="text-prism-panel-title text-prism-ink">
            Testnet faucet
          </h3>
          <Button
            ref={watchRef}
            type="button"
            variant="ghost"
            aria-haspopup="dialog"
            aria-label="Watch how: Get testnet tREVO from the faucet (video)"
            onClick={() => setVideo(WATCH_HOW)}
            className="-mr-3 max-sm:-ml-3 max-sm:order-last max-sm:w-full max-sm:justify-start"
          >
            <PlayCircle aria-hidden />
            Watch how
          </Button>
        </div>
        <p className="text-prism-body text-prism-ink-2">
          Get {amount} tREVO once every 24 hours to try staking, pools and payments.
        </p>
      </div>

      {allDone ? (
        <div className="flex h-commit items-center gap-3 border-y border-prism-line">
          <StepStatus done />
          <span className="text-prism-label font-semibold text-prism-ink">Page steps done</span>
        </div>
      ) : (
        <div className="space-y-[13px]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-prism-label font-semibold text-prism-ink">
                Before you use the faucet
              </h4>
              <p className="text-prism-meta text-prism-ink-2">
                The faucet opens once your page has these 4 things.
              </p>
            </div>
            <span className="shrink-0 text-prism-meta tabular-nums text-prism-ink-2">
              {faucet.doneCount} of 4 done
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Page steps"
            aria-valuemin={0}
            aria-valuemax={4}
            aria-valuenow={faucet.doneCount}
            className="h-[3px] w-full overflow-hidden rounded-[3px] bg-[rgba(22,21,43,0.18)]"
          >
            <div
              className="h-full rounded-[3px] bg-prism-success transition-[width] duration-[377ms] ease-prism motion-reduce:transition-none"
              style={{ width: `${(faucet.doneCount / 4) * 100}%` }}
            />
          </div>
          <ul>
            {STEPS.map(step => {
              const done = requirements[step.key];
              return (
                <li
                  key={step.key}
                  className="flex min-h-commit items-center gap-3 border-b border-prism-line py-1 last:border-b-0"
                >
                  <StepStatus done={done} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-prism-label font-semibold text-prism-ink">
                      {step.label}
                      {done && <span className="sr-only">, done</span>}
                    </span>
                    <span className="block text-prism-meta text-prism-ink-2">
                      {describe(step.key, done)}
                    </span>
                  </span>
                  {!done && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => navigate(step.to)}
                      className="-mr-3 shrink-0"
                    >
                      {step.action}
                      <ArrowRight aria-hidden />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className={cn(faucet.state === "setup" && "space-y-2")}>
        {control}
        {faucet.state === "setup" && (
          <p id={helperId} className="sr-only">
            Finish the steps above to request tREVO.
          </p>
        )}
      </div>

      <Notes />

      <VideoPlayerDialog video={video} onClose={() => setVideo(null)} returnFocus={watchRef} />
    </article>
  );
}
