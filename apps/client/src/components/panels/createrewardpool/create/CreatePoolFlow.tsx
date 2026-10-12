import { useEffect, useId, useRef, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { parseEther } from "viem";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Circle,
  Coins,
  Copy,
  ExternalLink,
  Link2,
  LoaderCircle,
  Pencil,
  XCircle,
} from "lucide-react";
import {
  Button,
  Checkbox,
  CommitAction,
  Notice,
  SidePanel,
  StepBar,
  SuccessMoment,
  cn,
} from "@repo/ui";
import { toast } from "@/components/ui/toast";
import { ReconnectCard } from "@/components/panels/wallet/send/ReconnectCard";
import { formatTokenAmount } from "../../explore/pool-panel/format";
import { ComplianceCard, TestnetLine } from "../../explore/pool-panel/sections";
import type { CreatorPoolFormValues } from "../types";
import { COPY, DESCRIPTION_MAX, INITIAL_STAKE, STEPS, WATCH_HOW_VIDEO } from "./copy";
import { CreatorShareField } from "./CreatorShareField";
import { PoolImageField, type PoolImage } from "./PoolImageField";
import { PoolPreviewMedium, type PreviewValues } from "./PoolPreviewCard";
import { WatchHow } from "./VideoDialog";
import type { FailCause, LaunchState, NetworkFee } from "./useLaunchPool";

export type FlowStep = "amount" | "review";

const CAUSE: Record<FailCause, string> = {
  rejected: "You declined in your wallet. Nothing was sent.",
  funds: "Your wallet does not have enough tREVO for the stake and the network fee.",
  // Approved wording 3 (066, 083 D1 pattern)
  reverted:
    "The transaction failed. Your pool was not created. The network fee may still be charged.",
  other: "The pool was not created.",
};

const shortHash = (hash: string) => `${hash.slice(0, 6)}…${hash.slice(-4)}`;

function TxRow({ hash }: { hash: string }) {
  const copy = () =>
    navigator.clipboard
      .writeText(hash)
      .then(() => toast.add({ title: "Transaction copied", type: "success" }))
      .catch(() => undefined);
  return (
    <div className="flex min-h-touch items-center justify-between gap-3 px-4">
      <span className="text-prism-label text-prism-ink-2">Transaction</span>
      <span className="flex items-center gap-1 text-prism-label tabular-nums text-prism-ink">
        {shortHash(hash)}
        <button
          type="button"
          onClick={copy}
          className="prism-focus inline-flex h-touch w-touch items-center justify-center rounded-full text-prism-ink-2"
        >
          <Copy aria-hidden className="h-4 w-4" />
          <span className="sr-only">Copy transaction hash</span>
        </button>
      </span>
    </div>
  );
}

function ExplorerLink({ explorer, hash }: { explorer?: string; hash?: string }) {
  // 066 I07: the explorer of the active chain; hidden when none is configured
  if (!explorer || !hash) return null;
  return (
    <div className="flex justify-end">
      <Button asChild variant="ghost">
        <a href={`${explorer}/tx/${hash}`} target="_blank" rel="noopener noreferrer">
          View on explorer
          <ExternalLink aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </Button>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="flex items-center gap-1.5 text-prism-meta text-prism-danger">
      <AlertCircle aria-hidden className="h-[21px] w-[21px] shrink-0" />
      {message}
    </p>
  );
}

type RowState = "done" | "current" | "next";

function ProgressRow({
  state,
  label,
  status,
  action,
}: {
  state: RowState;
  label: string;
  status?: string;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex min-h-commit items-center gap-3 px-4">
      {state === "done" ? (
        <CheckCircle2 aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-success" />
      ) : state === "current" ? (
        <LoaderCircle
          aria-hidden
          className="h-[21px] w-[21px] shrink-0 animate-spin text-prism-nav motion-reduce:animate-none"
        />
      ) : (
        <Circle aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-line-strong" />
      )}
      <span
        className={cn(
          "flex-1 text-prism-label",
          state === "next" ? "text-prism-ink-2" : "font-semibold text-prism-ink"
        )}
      >
        {label}
        {state === "done" && <span className="sr-only">, done</span>}
      </span>
      {status && <span className="text-prism-meta text-prism-ink-2">{status}</span>}
      {action}
    </li>
  );
}

/**
 * Screen Review 065 and 066: create pool as one money flow in the G3 value
 * panel. Amount (the setup fields), Review in the calm commit state, then
 * Confirm in wallet with tracked progress, a result or a failure.
 */
export function CreatePoolFlow({
  open,
  onOpenChange,
  step,
  onStepChange,
  image,
  onImageChange,
  preview,
  symbol,
  chainName,
  explorer,
  balanceWei,
  balanceLoading,
  walletReady,
  fee,
  onRetryFee,
  launch,
  onLaunch,
  onRetryLaunch,
  onResetLaunch,
  onOpenPool,
  poolLink,
  staleNotice,
  onDismissStale,
  onGetTrevo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: FlowStep;
  onStepChange: (step: FlowStep) => void;
  image: PoolImage | null;
  onImageChange: (image: PoolImage | null) => void;
  preview: PreviewValues;
  symbol: string;
  chainName: string;
  explorer?: string;
  balanceWei: bigint;
  balanceLoading: boolean;
  // The live wallet can sign (063 D1)
  walletReady: boolean;
  fee: NetworkFee;
  onRetryFee: () => void;
  launch: LaunchState;
  onLaunch: () => void;
  onRetryLaunch: () => void;
  onResetLaunch: () => void;
  onOpenPool: () => void;
  poolLink?: string;
  staleNotice: boolean;
  onDismissStale: () => void;
  // 065 I06: Wallet with the Get tREVO section (D19)
  onGetTrevo: () => void;
}) {
  const {
    register,
    control,
    watch,
    trigger,
    formState: { errors, isValid },
  } = useFormContext<CreatorPoolFormValues>();
  const [agreed, setAgreed] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const ids = { name: useId(), nameNote: useId(), desc: useId(), descNote: useId() };

  const description = watch("poolDescription") ?? "";
  const stakeWei = parseEther(INITIAL_STAKE);
  const lowBalance = !balanceLoading && balanceWei < stakeWei;
  const feeWei = fee.status === "ready" ? fee.fee : 0n;
  const totalWei = stakeWei + feeWei;
  const amount = (wei: bigint) => `${formatTokenAmount(wei)} ${symbol}`;
  const coversTotal = balanceWei >= totalWei;

  const phase = launch.phase;
  const launching = phase !== "idle";
  const signing = phase === "signing";
  const calm = step === "review" || launching;
  const current = phase === "done" ? STEPS.length : launching ? 2 : step === "review" ? 1 : 0;

  // Agreement resets when the person goes back to edit
  useEffect(() => {
    if (step === "amount") setAgreed(false);
  }, [step]);

  // 066 I13: focus the step heading on each step change
  useEffect(() => {
    if (open) requestAnimationFrame(() => headingRef.current?.focus());
  }, [open, step, phase === "done", phase === "failed"]); // eslint-disable-line react-hooks/exhaustive-deps

  const toReview = async () => {
    const ok = await trigger();
    if (ok && !lowBalance) onStepChange("review");
  };

  const announce =
    phase === "signing"
      ? "Confirm in your wallet."
      : phase === "chain"
        ? "Signed in wallet. Waiting for the network."
        : phase === "saving"
          ? "Pool created on chain. Saving to Amped.Bio."
          : phase === "sync-failed"
            ? "Pool created on chain. Finishing setup."
            : phase === "done"
              ? "Your pool is live."
              : phase === "failed"
                ? "Pool was not created."
                : step === "review"
                  ? "Step 2 of 3, Review."
                  : "";

  /* ----------------------------------------------------------------------- */
  /* Bodies                                                                  */
  /* ----------------------------------------------------------------------- */

  const amountBody = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-prism-meta text-prism-ink-2">{COPY.intro}</p>
        <WatchHow video={WATCH_HOW_VIDEO} />
      </div>
      {staleNotice && (
        <Notice variant="info" role="status">
          <div className="flex items-start gap-2">
            <p className="flex-1">{COPY.staleNotice}</p>
            <Button type="button" variant="ghost" size="sm" onClick={onDismissStale}>
              Dismiss
            </Button>
          </div>
        </Notice>
      )}
      <PoolPreviewMedium values={preview} />
      <PoolImageField value={image} onChange={onImageChange} />

      <div className="space-y-2">
        <label htmlFor={ids.name} className="block text-prism-label font-semibold text-prism-ink">
          Pool name
        </label>
        <input
          id={ids.name}
          autoComplete="off"
          aria-invalid={errors.poolName ? true : undefined}
          aria-describedby={`${ids.nameNote} ${errors.poolName ? `${ids.name}-err` : ""}`}
          className={cn(
            "prism-well prism-focus h-touch w-full px-4 text-prism-label text-prism-ink focus:outline-none",
            errors.poolName && "shadow-[inset_0_0_0_1.5px_#B3261E]"
          )}
          {...register("poolName")}
        />
        <FieldError id={`${ids.name}-err`} message={errors.poolName?.message} />
        <p id={ids.nameNote} className="text-prism-meta text-prism-ink-2">
          {COPY.nameHelper}
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor={ids.desc} className="block text-prism-label font-semibold text-prism-ink">
          Description
        </label>
        <textarea
          id={ids.desc}
          rows={3}
          maxLength={DESCRIPTION_MAX}
          aria-invalid={errors.poolDescription ? true : undefined}
          aria-describedby={`${ids.descNote} ${errors.poolDescription ? `${ids.desc}-err` : ""}`}
          className={cn(
            "prism-well prism-focus block min-h-[89px] w-full resize-none px-4 py-3 text-prism-body text-prism-ink focus:outline-none",
            errors.poolDescription && "shadow-[inset_0_0_0_1.5px_#B3261E]"
          )}
          {...register("poolDescription")}
        />
        <FieldError id={`${ids.desc}-err`} message={errors.poolDescription?.message} />
        <p
          id={ids.descNote}
          className="flex justify-between gap-3 text-prism-meta text-prism-ink-2"
        >
          <span>{COPY.descriptionHelper}</span>
          <span className="tabular-nums" aria-label={`${description.length} of 500 characters`}>
            {description.length}/{DESCRIPTION_MAX}
          </span>
        </p>
      </div>

      <Controller
        name="creatorFee"
        control={control}
        render={({ field, fieldState }) => (
          <CreatorShareField
            value={field.value}
            onChange={value => {
              field.onChange(value);
              void trigger("creatorFee");
            }}
            error={fieldState.error?.message}
          />
        )}
      />

      <div className="space-y-1 border-t border-prism-line pt-[21px]">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-prism-label font-bold text-prism-ink">Initial stake</span>
          <span className="text-prism-label font-semibold tabular-nums text-prism-ink">
            {INITIAL_STAKE} {symbol}
          </span>
        </div>
        <p className="text-prism-meta text-prism-ink-2">{COPY.stakeHelper}</p>
        <p className="flex flex-wrap justify-between gap-x-3 text-prism-meta tabular-nums text-prism-ink-2">
          <span>
            Available{" "}
            <b className="font-semibold text-prism-ink">
              {balanceLoading ? "Loading" : amount(balanceWei)}
            </b>
          </span>
          <span>
            Balance after{" "}
            <b className="font-semibold text-prism-ink">
              {balanceLoading
                ? "Loading"
                : lowBalance
                  ? "Not enough"
                  : amount(balanceWei - stakeWei)}
            </b>
          </span>
        </p>
        {lowBalance && (
          <div className="prism-slab mt-2 flex min-h-touch items-center gap-2 !rounded-prism-13 py-1 pl-4 pr-1">
            <AlertCircle aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-danger" />
            <p role="alert" className="flex-1 text-prism-meta text-prism-danger">
              {COPY.lowBalance}
            </p>
            <Button type="button" variant="ghost" onClick={onGetTrevo}>
              Get tREVO
            </Button>
          </div>
        )}
      </div>
      <TestnetLine />
    </>
  );

  const reviewBody = (
    <>
      <div className="flex items-center justify-between gap-3">
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2 outline-none"
        >
          <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-value" />
          Launch terms
        </h3>
        <Button type="button" variant="secondary" onClick={() => onStepChange("amount")}>
          <Pencil aria-hidden />
          Edit pool
        </Button>
      </div>
      <dl className="prism-slab divide-y divide-prism-line font-prism">
        {[
          { label: "Pool name", value: preview.name.trim() },
          { label: "Pool type", value: "Reward pool" },
          {
            label: "Description",
            value: <span className="line-clamp-2 font-normal">{description.trim()}</span>,
          },
          {
            label: "Creator share",
            value: (
              <>
                {preview.share}%
                <span className="block text-prism-meta font-normal text-prism-ink-2">
                  {COPY.shareSublabel}
                </span>
              </>
            ),
          },
          { label: "Initial stake", value: `${INITIAL_STAKE} ${symbol}` },
          {
            label: "Network fee",
            value:
              fee.status === "ready" ? (
                `About ${amount(fee.fee)}`
              ) : fee.status === "calculating" ? (
                <span
                  aria-label="Calculating"
                  className="inline-block h-3 w-24 rounded-full bg-prism-line"
                />
              ) : (
                <span className="flex items-center gap-1 font-normal">
                  Not available
                  <Button type="button" variant="ghost" size="sm" onClick={onRetryFee}>
                    Retry
                  </Button>
                </span>
              ),
          },
          {
            label: "Total from wallet",
            value:
              fee.status === "ready" ? (
                <b>{amount(totalWei)}</b>
              ) : (
                `${INITIAL_STAKE} ${symbol} plus the fee`
              ),
          },
          {
            label: "Balance after",
            value: coversTotal ? amount(balanceWei - totalWei) : "Not enough",
          },
        ].map(row => (
          <div
            key={row.label}
            className="flex min-h-touch items-center justify-between gap-4 px-4 py-2"
          >
            <dt className="shrink-0 text-prism-label text-prism-ink-2">{row.label}</dt>
            <dd className="min-w-0 text-right text-prism-label font-semibold tabular-nums text-prism-ink">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {!coversTotal && !balanceLoading && (
        <p role="alert" className="flex items-center gap-1.5 text-prism-meta text-prism-danger">
          <AlertCircle aria-hidden className="h-[21px] w-[21px] shrink-0" />
          {COPY.lowBalance}
        </p>
      )}
      <p className="text-prism-meta text-prism-ink-2">{COPY.launchTerms}</p>
      <ComplianceCard />
      <Checkbox checked={agreed} onCheckedChange={setAgreed} required>
        {COPY.checkbox} <span className="text-prism-ink-2">(Required)</span>
      </Checkbox>
    </>
  );

  const hash = "hash" in launch ? launch.hash : undefined;

  const progressBody = (() => {
    const signed: RowState = phase === "signing" ? "current" : "done";
    const chain: RowState =
      phase === "signing" ? "next" : phase === "chain" || phase === "unknown" ? "current" : "done";
    const saved: RowState =
      phase === "saving" || phase === "sync-failed"
        ? "current"
        : phase === "done"
          ? "done"
          : "next";
    return (
      <>
        <div>
          <h3
            ref={headingRef}
            tabIndex={-1}
            className="text-prism-panel-title text-prism-ink outline-none"
          >
            {signing ? "Confirm in your wallet" : "Creating your pool"}
          </h3>
          <p className="mt-2 text-prism-body text-prism-ink-2">
            {signing
              ? "Approve the pool launch in your wallet to continue."
              : "This takes about a minute. You can close this panel; My Pool shows the status."}
          </p>
        </div>
        <ul className="prism-slab divide-y divide-prism-line font-prism">
          <ProgressRow state={signed} label="Signed in wallet" />
          <ProgressRow
            state={chain}
            label="Pool created on chain"
            status={
              phase === "chain"
                ? "Waiting for the network"
                : phase === "unknown"
                  ? "Still waiting"
                  : undefined
            }
            action={
              phase === "unknown" ? (
                <Button type="button" variant="ghost" size="sm" onClick={onRetryLaunch}>
                  Check again
                </Button>
              ) : undefined
            }
          />
          <ProgressRow
            state={saved}
            label={phase === "sync-failed" ? "Finishing setup" : "Pool saved to Amped.Bio"}
            action={
              phase === "sync-failed" ? (
                <Button type="button" variant="ghost" size="sm" onClick={onRetryLaunch}>
                  Retry
                </Button>
              ) : undefined
            }
          />
        </ul>
        {hash && (
          <div className="prism-slab">
            <TxRow hash={hash} />
          </div>
        )}
        <ExplorerLink explorer={explorer} hash={hash} />
      </>
    );
  })();

  const resultBody =
    launch.phase === "done" ? (
      <>
        {/* Result step only, never Review or Commit (Prism 15, #26 section 3.4) */}
        <SuccessMoment label="Pool created" size={72} />
        <div>
          <h3
            ref={headingRef}
            tabIndex={-1}
            className="text-prism-panel-title text-prism-ink outline-none"
          >
            Your pool is live
          </h3>
          <p className="mt-2 text-prism-body text-prism-ink-2">
            Fans can find it in Explore and stake from your page.
          </p>
        </div>
        <dl className="prism-slab divide-y divide-prism-line font-prism">
          {[
            ["Pool name", preview.name.trim()],
            ["Creator share", `${preview.share}%`],
            ["Initial stake", `${INITIAL_STAKE} ${symbol}`],
          ].map(([label, value]) => (
            <div key={label} className="flex min-h-touch items-center justify-between gap-4 px-4">
              <dt className="text-prism-label text-prism-ink-2">{label}</dt>
              <dd className="text-right text-prism-label tabular-nums text-prism-ink">{value}</dd>
            </div>
          ))}
          <TxRow hash={launch.hash} />
        </dl>
        {launch.imageFailed && (
          <p className="flex items-start gap-2 text-prism-meta text-prism-ink-2">
            <AlertTriangle
              aria-hidden
              className="h-[21px] w-[21px] shrink-0 text-prism-warning-ink"
            />
            {COPY.imageFailed}
          </p>
        )}
        <ExplorerLink explorer={explorer} hash={launch.hash} />
      </>
    ) : null;

  const failedBody =
    launch.phase === "failed" ? (
      <>
        <div className="prism-slab divide-y divide-prism-line font-prism">
          <div className="flex items-start gap-3 p-4">
            <XCircle aria-hidden className="mt-px h-[21px] w-[21px] shrink-0 text-prism-danger" />
            <div>
              <h3
                ref={headingRef}
                tabIndex={-1}
                className="text-prism-label font-bold text-prism-ink outline-none"
              >
                Pool was not created
              </h3>
              <p className="mt-1 text-prism-body text-prism-ink">{CAUSE[launch.cause]}</p>
            </div>
          </div>
          <button
            type="button"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen(value => !value)}
            className="prism-focus flex min-h-commit w-full items-center justify-between px-4 text-prism-label font-semibold text-prism-ink"
          >
            Details
            <ChevronDown
              aria-hidden
              className={cn("h-5 w-5 transition-transform", detailsOpen && "rotate-180")}
            />
          </button>
          {detailsOpen && (
            <>
              <p className="break-words px-4 py-3 text-prism-meta text-prism-ink-2">{launch.raw}</p>
              {launch.hash && <TxRow hash={launch.hash} />}
            </>
          )}
        </div>
        <ExplorerLink explorer={explorer} hash={launch.hash} />
      </>
    ) : null;

  /* ----------------------------------------------------------------------- */
  /* Footers                                                                 */
  /* ----------------------------------------------------------------------- */

  let footer: React.ReactNode;
  if (phase === "done") {
    footer = (
      <>
        <TestnetLine />
        <Button type="button" size="lg" className="w-full" onClick={onOpenPool}>
          Open My Pool
          <ArrowRight aria-hidden />
        </Button>
        {poolLink && (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() =>
              navigator.clipboard
                .writeText(poolLink)
                .then(() => toast.add({ title: "Link copied", type: "success" }))
                .catch(() => undefined)
            }
          >
            <Link2 aria-hidden />
            Copy pool link
          </Button>
        )}
      </>
    );
  } else if (phase === "failed") {
    footer = (
      <>
        <TestnetLine />
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={() => {
            onResetLaunch();
            onStepChange("review");
          }}
        >
          Back to review
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => onOpenChange(false)}
        >
          Close
        </Button>
      </>
    );
  } else if (launching) {
    footer = <TestnetLine />;
  } else if (!walletReady) {
    // 063 D1: the shared card replaces the action that needs a signature
    footer = <ReconnectCard />;
  } else if (step === "review") {
    footer = (
      <CommitAction disabled={!agreed || !coversTotal} onClick={onLaunch}>
        <Coins aria-hidden />
        Launch pool with {INITIAL_STAKE} {symbol}
      </CommitAction>
    );
  } else {
    footer = (
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={!isValid || lowBalance || balanceLoading}
        onClick={() => void toReview()}
      >
        Review pool
        <ArrowRight aria-hidden />
      </Button>
    );
  }

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={COPY.eyebrow}
      title={preview.name.trim() || "Your pool"}
      byline={`by @${preview.handle} · ${chainName}`}
      art={
        preview.image ? (
          <img src={preview.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-[#EFE7F8]">
            <Coins aria-hidden className="h-[21px] w-[21px] text-prism-value-ink" />
          </span>
        )
      }
      calm={calm}
      dismissible={!signing}
      footer={footer}
    >
      <StepBar steps={STEPS} current={current} />
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
      {phase === "done"
        ? resultBody
        : phase === "failed"
          ? failedBody
          : launching
            ? progressBody
            : step === "review"
              ? reviewBody
              : amountBody}
    </SidePanel>
  );
}
