import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  Droplet,
  Info,
  PlayCircle,
} from "lucide-react";
import { Button, ErrorCard, Notice, Skeleton, cn } from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import { useDelayed } from "@/hooks/useDelayed";
import { toast } from "@/components/ui/toast";
import { VideoPlayerDialog, type PlayerVideo } from "../../home/VideoPlayerDialog";
import { useFaucet, type FaucetRequirements } from "./useFaucet";

const WATCH_HOW: PlayerVideo = { id: "j_TED4IA4bc", title: "Get testnet tREVO from the faucet" };
const MIN_BLOCKS = 5;
const COOLDOWN_SECONDS = 24 * 60 * 60;
// Short testnet line for the card. The full notice sits in the Home Testnet card.
const TESTNET_LINE = "Testnet only. tREVO has no cash value.";

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

/**
 * The cooldown ring: the 24 hour window drains as the countdown runs. The
 * figure updates every second; the live text is announced once a minute (053 I09).
 */
function CooldownRing({ until, onDone }: { until: Date; onDone: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const done = now >= until.getTime();
  useEffect(() => {
    if (done) onDone();
  }, [done, onDone]);

  const leftSeconds = Math.max(0, (until.getTime() - now) / 1000);
  const fraction = Math.min(1, leftSeconds / COOLDOWN_SECONDS);
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  const minuteText = `You can get more in ${countdown(until, Math.floor(now / 60_000) * 60_000).slice(0, 5)}.`;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-[144px] w-[144px]">
        <svg aria-hidden viewBox="0 0 144 144" className="h-full w-full -rotate-90">
          <circle
            cx="72"
            cy="72"
            r={radius}
            fill="none"
            strokeWidth="8"
            className="stroke-prism-line-strong"
          />
          <circle
            cx="72"
            cy="72"
            r={radius}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - fraction)}
            className="stroke-prism-nav transition-[stroke-dashoffset] duration-prism-control motion-reduce:transition-none"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            aria-hidden
            className="font-prism-display text-[34px] leading-[34px] tabular-nums text-prism-ink"
          >
            {countdown(until, now)}
          </span>
          <span aria-hidden className="text-prism-meta text-prism-ink-2">
            until next
          </span>
        </div>
      </div>
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

function FaucetSkeleton() {
  return (
    <div
      aria-busy
      aria-label="Loading the testnet faucet"
      className="prism-glass-clear space-y-[13px] !rounded-prism-21 p-[21px]"
    >
      <Skeleton className="h-touch w-[180px] rounded-prism-13" />
      <Skeleton className="h-[44px] w-3/5 rounded-prism-8" />
      <Skeleton className="h-[44px] w-full rounded-prism-13" />
      <Skeleton className="h-commit w-full rounded-prism-13" />
    </div>
  );
}

/**
 * The Daily faucet card in the Home Get tREVO section. Moved from the Wallet
 * with every request state kept: setup, ready, sending, sent, cooldown,
 * paused, empty, did not load and loading. The amount leads; only the page
 * steps still open are listed, done steps sit behind one toggle.
 */
export default function FaucetCard() {
  const faucet = useFaucet();
  const navigate = useNavigate();
  const { blocks } = useEditor();
  const titleId = useId();
  const helperId = useId();
  const errorId = useId();
  const doneListId = useId();
  const [video, setVideo] = useState<PlayerVideo | null>(null);
  const [showDone, setShowDone] = useState(false);
  const watchRef = useRef<HTMLButtonElement>(null);
  const showSkeleton = useDelayed(faucet.state === "loading", 400);

  if (faucet.state === "loading") return showSkeleton ? <FaucetSkeleton /> : null;

  if (faucet.state === "error") {
    return (
      <div id="faucet">
        <ErrorCard
          title="Daily faucet"
          cause="We could not reach the faucet."
          retryLabel="Retry"
          onRetry={faucet.retry}
          className="!rounded-prism-21"
        />
      </div>
    );
  }

  const paused = faucet.state === "paused";
  const amount = formatAmount(faucet.amount);
  const requirements = faucet.requirements!;
  const openSteps = STEPS.filter(step => !requirements[step.key]);
  const doneSteps = STEPS.filter(step => requirements[step.key]);
  const nextStep = openSteps[0];
  const blockCount = blocks?.length ?? 0;

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

  let body: React.ReactNode = null;
  let control: React.ReactNode = null;
  switch (faucet.state) {
    case "setup":
      body = (
        <div className="space-y-[13px]">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-prism-label font-semibold text-prism-ink">
              {openSteps.length === 1 ? "1 page step left" : `${openSteps.length} page steps left`}
            </h4>
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
            {openSteps.map(step => (
              <li
                key={step.key}
                className="flex min-h-touch items-center gap-3 border-b border-prism-line last:border-b-0"
              >
                <StepStatus done={false} />
                <span className="min-w-0 flex-1 text-prism-label font-semibold text-prism-ink">
                  {step.label}
                  {step.key === "minLinks" && (
                    <span className="ml-2 text-prism-meta font-normal tabular-nums text-prism-ink-2">
                      {Math.min(blockCount, MIN_BLOCKS)} of {MIN_BLOCKS}
                    </span>
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate(step.to)}
                  className="-mr-3 shrink-0"
                >
                  {step.action}
                </Button>
              </li>
            ))}
          </ul>
          {doneSteps.length > 0 && (
            <div>
              <button
                type="button"
                aria-expanded={showDone}
                aria-controls={doneListId}
                onClick={() => setShowDone(value => !value)}
                className="prism-focus flex min-h-touch items-center gap-2 rounded-prism-8 text-prism-label font-semibold text-prism-nav"
              >
                {showDone ? "Hide done steps" : "Show done steps"}
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "h-[18px] w-[18px] transition-transform duration-prism-control motion-reduce:transition-none",
                    showDone && "rotate-180"
                  )}
                />
              </button>
              <ul id={doneListId} hidden={!showDone}>
                {doneSteps.map(step => (
                  <li key={step.key} className="flex min-h-touch items-center gap-3">
                    <StepStatus done />
                    <span className="text-prism-label text-prism-ink-2">
                      {step.label}
                      <span className="sr-only">, done</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
      control = (
        <>
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
          <p id={helperId} className="sr-only">
            Finish the steps above to request tREVO.
          </p>
        </>
      );
      break;
    case "ready":
    case "sending":
      if (faucet.state === "ready") {
        body = (
          <p className="flex items-center gap-2 rounded-prism-13 bg-[rgba(23,105,63,0.08)] p-[13px] text-prism-label font-semibold text-prism-success">
            <StepStatus done />
            Ready. Page steps done.
          </p>
        );
      }
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
      body = (
        <Notice variant="info" role="status">
          <p>Request sent. tREVO arrives in your wallet within a few hours.</p>
        </Notice>
      );
      control = (
        <Button type="button" variant="secondary" size="lg" className="w-full" disabled>
          Requested today
        </Button>
      );
      break;
    case "cooldown":
      body = faucet.nextAvailable ? (
        <CooldownRing until={faucet.nextAvailable} onDone={faucet.retry} />
      ) : null;
      break;
    case "paused":
      body = (
        <Notice variant="info">
          <p>The test token faucet is paused. Check back later.</p>
        </Notice>
      );
      control = (
        <Button type="button" variant="secondary" size="lg" className="w-full" disabled>
          <Droplet aria-hidden />
          Get tREVO
        </Button>
      );
      break;
    case "empty":
      body = (
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
      className="prism-glass-clear flex flex-col gap-[21px] !rounded-prism-21 p-[21px] font-prism"
    >
      <div className="flex items-center gap-[13px]">
        <span
          aria-hidden
          className="flex h-touch w-touch shrink-0 items-center justify-center rounded-prism-13 bg-[rgba(39,170,225,0.14)] text-prism-create-ink"
        >
          <Droplet className="h-[21px] w-[21px]" />
        </span>
        <h3 id={titleId} className="min-w-0 flex-1 text-prism-panel-title text-prism-ink">
          Daily faucet
        </h3>
        <Button
          ref={watchRef}
          type="button"
          variant="ghost"
          aria-haspopup="dialog"
          aria-label="Watch how: Get testnet tREVO from the faucet (video)"
          onClick={() => setVideo(WATCH_HOW)}
          className="-mr-3 shrink-0"
        >
          <PlayCircle aria-hidden />
          Watch
        </Button>
      </div>

      {/* QA-042: a paused faucet has no amount to show */}
      {!paused && (
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span
            className={cn(
              "font-prism-display text-[55px] leading-[55px] tabular-nums",
              faucet.state === "setup" ? "text-prism-ink-3" : "text-prism-ink"
            )}
          >
            {amount}
          </span>
          <span className="text-prism-label font-bold text-prism-ink-2">tREVO every 24 hours</span>
        </p>
      )}

      {body}

      {control && <div className="mt-auto">{control}</div>}

      <p className="flex items-start gap-2 text-prism-meta text-prism-ink-2">
        <Info className="h-4 w-4 shrink-0 text-prism-nav" aria-hidden />
        <span>{TESTNET_LINE}</span>
      </p>

      <VideoPlayerDialog video={video} onClose={() => setVideo(null)} returnFocus={watchRef} />
    </article>
  );
}
