import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useReadContract } from "wagmi";
import { formatEther, parseEther, type Address } from "viem";
import Decimal from "decimal.js";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  AmountPresets,
  AmountWell,
  Button,
  Checkbox,
  CommitAction,
  ErrorCard,
  Notice,
  ReviewSlab,
  SidePanel,
  StepBar,
  trpc,
  trpcClient,
} from "@repo/ui";
import { CREATOR_POOL_ABI, L2_BASE_TOKEN_ABI, getChainConfig } from "@repo/web3";
import { toast } from "@/components/ui/toast";
import { ImageUploadModal } from "@/components/ImageUploadModal";
import { publicPageUrl } from "@/components/shell/pageLink";
import { useWalletContext } from "@/contexts/WalletContext";
import { useEditor } from "@/contexts/EditorContext";
import { usePoolReader } from "@/hooks/usePoolReader";
import { useStakingManager } from "@/hooks/useStakingManager";
import {
  classifyTxError,
  formatExactAmount,
  formatRewardRate,
  formatTokenAmount,
  limitDecimals,
  presetAmount,
  toDecimal,
  type TxErrorKind,
} from "./format";
import { useNetworkFee, type FeeRequest } from "./useNetworkFee";
import { PoolArt } from "./PoolArt";
import { PoolMenu } from "./PoolMenu";
import {
  ComplianceCard,
  ConfirmBody,
  ExplorerTxLink,
  Eyebrow,
  PanelSkeletonBody,
  PoolDescription,
  POOL_REWARDS_ARTICLE,
  RATE_HELPER,
  Slab,
  SlabRow,
  TestnetLine,
  UNSTAKE_TERMS,
} from "./sections";

// Screen Review 046, 047 and 048 (D12, D14, D23 to D25): pool details, stake,
// unstake and claim as one money flow in the G3 value panel. Desktop: the
// commitment field side panel. Mobile: a full screen sheet. Every value step
// runs Amount (stake and unstake), Review, Confirm in wallet, then a result.

const POOL_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const STAKE_STEPS = ["Amount", "Review", "Confirm in wallet"];
const CLAIM_STEPS = ["Review", "Confirm in wallet"];
// creatorCut is in basis points; 10000 means the creator keeps every reward
const FULL_CREATOR_CUT = 10000n;

type Flow = "stake" | "unstake" | "claim";
type Step = "amount" | "review" | "confirm" | "result";
type FlowError = TxErrorKind | "unconfirmed";

export interface PoolPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  poolId?: number;
  poolAddress?: string;
  // Runs after a stake, unstake or claim so the opener can refetch its list
  onChanged?: () => void;
}

const VERB: Record<Flow, string> = { stake: "stake", unstake: "unstake", claim: "claim" };
const EYEBROW: Record<Flow, string> = {
  stake: "Stake in",
  unstake: "Unstake from",
  claim: "Claim from",
};

function useDelayed(active: boolean, ms: number) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);
  return shown;
}

export default function PoolPanel({
  open,
  onOpenChange,
  poolId,
  poolAddress,
  onChanged,
}: PoolPanelProps) {
  const queryClient = useQueryClient();
  const { address: accountAddress } = useAccount();
  const { isWeb3Wallet, address: walletAddress, balance } = useWalletContext();
  const { setActivePanelAndNavigate } = useEditor();
  // Your position reads the saved wallet address, not only the live wagmi one
  const viewer = (walletAddress ?? accountAddress) as Address | undefined;

  const invalidLink = !!poolAddress && !POOL_ADDRESS.test(poolAddress);
  const poolQuery = useQuery({
    ...trpc.pools.fan.getPoolDetailsForModal.queryOptions({
      poolId: poolAddress ? undefined : poolId,
      poolAddress: poolAddress || undefined,
      walletAddress: viewer || undefined,
    }),
    enabled: open && !invalidLink && (!!poolId || !!poolAddress),
    staleTime: 60_000,
  });
  const pool = poolQuery.data;
  const notFound = invalidLink || poolQuery.error?.data?.code === "NOT_FOUND";
  const showSkeleton = useDelayed(open && poolQuery.isLoading, 400);

  const { creatorCut, fanStake, pendingReward, isReadingPendingReward, fetchAllData, claimReward } =
    usePoolReader(pool?.address as Address | undefined, viewer, {
      initialFanStake: pool?.stakedByYou ?? undefined,
      initialPendingReward: pool?.pendingRewards ?? undefined,
    });
  const { stake, unstake } = useStakingManager(
    pool ? { id: pool.id, chainId: pool.chainId, address: pool.address } : null
  );

  const chainId = pool ? Number(pool.chainId) : undefined;
  const chain = chainId ? getChainConfig(chainId) : undefined;
  const symbol = chain?.nativeCurrency.symbol ?? "tREVO";
  const explorer = chain?.blockExplorers?.default?.url;
  const tokenAddress = chain?.contracts.L2_BASE_TOKEN?.address as Address | undefined;

  const stakeWei = fanStake ?? pool?.stakedByYou ?? 0n;
  const pendingWei = pendingReward ?? pool?.pendingRewards ?? 0n;
  const balanceWei = balance?.data?.value ?? 0n;
  const stakeDec = new Decimal(formatEther(stakeWei));
  const balanceDec = new Decimal(formatEther(balanceWei));
  const pendingDec = new Decimal(formatEther(pendingWei));
  const amountText = (value: bigint | Decimal | string) => `${formatTokenAmount(value)} ${symbol}`;

  // Flow state
  const [flow, setFlow] = useState<Flow>("stake");
  const [step, setStep] = useState<Step>("amount");
  const [stakeAmount, setStakeAmount] = useState("");
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [unstakeMax, setUnstakeMax] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [phase, setPhase] = useState<"wallet" | "submitting">("wallet");
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [flowError, setFlowError] = useState<FlowError | null>(null);
  const [result, setResult] = useState<{ title: string; body: string } | null>(null);
  const [imageOpen, setImageOpen] = useState(false);

  const resetFlow = useCallback(() => {
    setFlow("stake");
    setStep("amount");
    setStakeAmount("");
    setUnstakeAmount("");
    setUnstakeMax(false);
    setAgreed(false);
    setPhase("wallet");
    setTxHash(undefined);
    setFlowError(null);
    setResult(null);
  }, []);

  useEffect(() => {
    if (!open) resetFlow();
  }, [open, poolId, poolAddress, resetFlow]);

  // Amounts and validation
  const amount = flow === "unstake" ? unstakeAmount : flow === "claim" ? "" : stakeAmount;
  const amountDec = flow === "claim" ? pendingDec : toDecimal(amount);
  const limit = flow === "unstake" ? stakeDec : balanceDec;
  let amountError: string | undefined;
  if (amountDec && flow !== "claim") {
    if (amountDec.lte(0)) amountError = "Enter an amount above 0.";
    else if (amountDec.gt(limit))
      amountError =
        flow === "unstake"
          ? `More than your ${amountText(stakeDec)} staked.`
          : `More than your ${amountText(balanceDec)} available.`;
  }
  const amountValid = !!amountDec && amountDec.gt(0) && !amountError;
  // The exact amount entered, with digit grouping, for Review and the commit label
  const exactAmount = `${formatExactAmount(amountDec ?? 0)} ${symbol}`;

  const amountWei = useMemo(() => {
    if (flow === "unstake" && unstakeMax) return stakeWei;
    try {
      return amount ? parseEther(amount) : 0n;
    } catch {
      return 0n;
    }
  }, [amount, flow, unstakeMax, stakeWei]);

  // Network fee for the call under review (048 I10)
  const feeRequest: FeeRequest | null = useMemo(() => {
    if (!pool) return null;
    if (flow === "claim") {
      return {
        address: pool.address as Address,
        abi: CREATOR_POOL_ABI,
        functionName: "claimReward",
      };
    }
    if (!tokenAddress || amountWei <= 0n) return null;
    return {
      address: tokenAddress,
      abi: L2_BASE_TOKEN_ABI,
      functionName: flow,
      args: [pool.address as Address, amountWei],
    };
  }, [pool, flow, tokenAddress, amountWei]);
  const fee = useNetworkFee({
    chainId,
    account: viewer,
    request: feeRequest,
    enabled: step === "review",
  });
  // Max on the stake Amount step keeps room for the fee: a 1 wei stake gives
  // the gas cost (it does not depend on the amount), doubled for price moves.
  const maxFee = useNetworkFee({
    chainId,
    account: viewer,
    request:
      pool && tokenAddress
        ? {
            address: tokenAddress,
            abi: L2_BASE_TOKEN_ABI,
            functionName: "stake",
            args: [pool.address as Address, 1n],
          }
        : null,
    enabled: open && isWeb3Wallet && flow === "stake" && step === "amount" && balanceWei > 0n,
  });
  const maxFeeDec = new Decimal(formatEther(maxFee.status === "ready" ? maxFee.fee * 2n : 0n));
  const feeWei = fee.status === "ready" ? fee.fee : 0n;
  const feeDec = new Decimal(formatEther(feeWei));
  const feeText =
    fee.status === "ready"
      ? `about ${amountText(fee.fee)}`
      : fee.status === "calculating"
        ? "Calculating"
        : "Shown in your wallet";

  // Defensive: the contract can block unstaking (UnstakingCooldown). Rob
  // confirmed there is no cooldown today; read it so "any time" stays true.
  const canUnstakeRead = useReadContract({
    address: tokenAddress,
    abi: L2_BASE_TOKEN_ABI,
    functionName: "canUnstake",
    args: viewer && pool ? [viewer, pool.address as Address] : undefined,
    chainId,
    query: { enabled: open && flow === "unstake" && !!viewer && !!pool && !!tokenAddress },
  });
  const unstakeBlocked = canUnstakeRead.data === false;

  const isCreator =
    !!pool && !!viewer && pool.creator.address.toLowerCase() === viewer.toLowerCase();
  const fullCut = creatorCut !== undefined && creatorCut >= FULL_CREATOR_CUT;
  const hasPosition = stakeWei > 0n || pendingWei > 0n;

  // Actions
  const refresh = async () => {
    await Promise.allSettled([
      fetchAllData(),
      poolQuery.refetch(),
      balance?.refetch?.(),
      queryClient.invalidateQueries({ queryKey: trpc.pools.pathKey() }),
    ]);
    onChanged?.();
  };

  const startFlow = (next: Flow, nextStep: Step) => {
    setFlow(next);
    setStep(nextStep);
    setAgreed(false);
    setFlowError(null);
    setTxHash(undefined);
  };

  const backToDetails = () => {
    startFlow("stake", "amount");
    setResult(null);
  };

  const commit = async () => {
    if (!pool) return;
    const sent: { hash?: `0x${string}` } = {};
    const onHash = (hash: `0x${string}`) => {
      sent.hash = hash;
      setTxHash(hash);
      setPhase("submitting");
    };
    const shownAmount = exactAmount;
    const poolName = pool.name;
    setFlowError(null);
    setTxHash(undefined);
    setPhase("wallet");
    setStep("confirm");
    try {
      if (flow === "stake") {
        await stake(amount, { onHash });
        setResult({
          title: "Stake confirmed",
          body: `${shownAmount} is staked in ${poolName}. Your stake in this pool is now ${amountText(stakeDec.plus(amountDec ?? 0))}.`,
        });
      } else if (flow === "unstake") {
        await unstake(unstakeAmount, {
          onHash,
          amountWei: unstakeMax ? stakeWei : undefined,
        });
        setResult({
          title: "Unstake confirmed",
          body: `${shownAmount} is back in your wallet. Your stake in this pool is now ${amountText(Decimal.max(0, stakeDec.minus(amountDec ?? 0)))}.`,
        });
      } else {
        await claimReward(pool.id, { onHash });
        setResult({
          title: "Claim sent",
          body: `${amountText(pendingDec)} arrives in your wallet within a few hours.`,
        });
      }
      setStep("result");
      void refresh();
    } catch (error) {
      setFlowError(sent.hash ? "unconfirmed" : classifyTxError(error));
      setStep("review");
    }
  };

  const share = () => {
    if (!pool) return;
    const url = `${import.meta.env.VITE_LANDINGPAGE_URL}/i/pools/${pool.address}`;
    if (navigator.share) {
      navigator.share({ title: pool.name, url }).catch(() => undefined);
      return;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => toast.add({ title: "Pool link copied", type: "success" }))
      .catch(() => toast.add({ title: "Could not copy the link", type: "error" }));
  };

  const setPoolImage = (fileId: number) => {
    if (!pool) return;
    trpcClient.pools.creator.setImageForPool
      .mutate({ id: pool.id, image_file_id: fileId })
      .then(async () => {
        await poolQuery.refetch();
        void queryClient.invalidateQueries({ queryKey: trpc.pools.pathKey() });
        toast.add({ title: "Pool image updated", type: "success" });
      })
      .catch(() =>
        toast.add({
          title: "Image did not update",
          type: "error",
          actionProps: { children: "Retry", onClick: () => setPoolImage(fileId) },
        })
      );
  };

  const goToWallet = () => {
    onOpenChange(false);
    setActivePanelAndNavigate("wallet");
  };

  // Header
  const creatorUrl = pool?.creator.handle ? publicPageUrl(pool.creator.handle) : undefined;
  const byline = pool ? (
    <>
      by {pool.creator.name}
      {creatorUrl && (
        <>
          {" · "}
          <a
            href={creatorUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="prism-focus font-semibold text-prism-nav-pressed underline underline-offset-2"
          >
            @{pool.creator.handle}
          </a>
        </>
      )}
    </>
  ) : undefined;

  const onDetails = flow === "stake" && step === "amount";
  const steps = flow === "claim" ? CLAIM_STEPS : STAKE_STEPS;
  const stepIndex =
    step === "result"
      ? steps.length
      : flow === "claim"
        ? step === "confirm"
          ? 1
          : 0
        : { amount: 0, review: 1, confirm: 2 }[step];

  // Bodies
  const renderStatus = () => {
    if (notFound) {
      return <ErrorCard title="This pool link is not valid" />;
    }
    if (poolQuery.isError) {
      return (
        <ErrorCard
          title="Pool did not load"
          cause="Check your connection and retry."
          onRetry={() => void poolQuery.refetch()}
          retryLabel="Retry"
        />
      );
    }
    return showSkeleton ? <PanelSkeletonBody /> : null;
  };

  const yourPosition = hasPosition && (
    <section className="space-y-3" aria-labelledby="pool-position">
      <div id="pool-position">
        <Eyebrow>Your position</Eyebrow>
      </div>
      <Slab>
        <SlabRow label="Your stake" value={amountText(stakeWei)} />
        <div className="flex min-h-touch items-center justify-between gap-4 px-4 py-2">
          <dt className="text-prism-label text-prism-ink-2">Pending rewards</dt>
          <dd className="flex items-center gap-3">
            <span className="whitespace-nowrap text-prism-label font-semibold tabular-nums text-prism-ink">
              {amountText(pendingWei)}
            </span>
            <Button
              variant="secondary"
              disabled={!isWeb3Wallet || isReadingPendingReward || pendingWei <= 0n}
              onClick={() => startFlow("claim", "review")}
            >
              Claim
            </Button>
          </dd>
        </div>
        {stakeWei > 0n && (
          <div className="flex min-h-touch items-center justify-between gap-4 px-4 py-2">
            <dt className="text-prism-label text-prism-ink-2">Unstake any time</dt>
            <dd>
              <Button
                variant="ghost"
                disabled={!isWeb3Wallet}
                onClick={() => startFlow("unstake", "amount")}
              >
                Unstake
              </Button>
            </dd>
          </div>
        )}
      </Slab>
    </section>
  );

  const aboutPool = pool && (
    <section className="space-y-3" aria-labelledby="pool-about">
      <div id="pool-about">
        <Eyebrow>About this pool</Eyebrow>
      </div>
      <Slab>
        <SlabRow label="Pool total" value={amountText(pool.stakedAmount)} />
        <SlabRow
          label="Backed by"
          value={`${pool.fans.toLocaleString("en-US")} ${pool.fans === 1 ? "fan" : "fans"}`}
        />
        <SlabRow
          label="Creator share of rewards"
          value={
            creatorCut === undefined || creatorCut === null
              ? "Not set"
              : `${(Number(creatorCut) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`
          }
        />
        {fullCut ? (
          <SlabRow label="Network Reward Rate">
            <p className="mt-1 text-prism-body text-prism-ink">
              The creator keeps 100% of pool rewards. Fans in this pool receive no rewards.
            </p>
          </SlabRow>
        ) : (
          <SlabRow
            label="Network Reward Rate"
            value={
              pool.apy !== undefined && pool.apy !== null ? formatRewardRate(pool.apy) : undefined
            }
          >
            {pool.apy !== undefined && pool.apy !== null ? (
              <>
                <p className="mt-1 text-prism-meta text-prism-ink-2">{RATE_HELPER}</p>
                <a
                  href={POOL_REWARDS_ARTICLE}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="How is the Network Reward Rate calculated?"
                  className="prism-focus mt-1 inline-block text-prism-meta font-semibold text-prism-nav underline underline-offset-2"
                >
                  How it is calculated
                </a>
              </>
            ) : (
              <p className="mt-1 text-prism-body text-prism-ink">
                {pool.stakedAmount > 0n
                  ? "Rate unavailable right now."
                  : "No rate yet. The rate shows once fans stake in this pool."}
              </p>
            )}
          </SlabRow>
        )}
        <SlabRow label="Unstaking">
          <p className="mt-1 text-prism-body text-prism-ink">{UNSTAKE_TERMS}</p>
        </SlabRow>
        {pool.description && <PoolDescription text={pool.description} />}
        <div className="px-4 py-3">
          <Button variant="ghost" asChild>
            <a href={POOL_REWARDS_ARTICLE} target="_blank" rel="noopener noreferrer">
              How pool rewards work
              <ArrowRight aria-hidden />
            </a>
          </Button>
        </div>
      </Slab>
    </section>
  );

  const amountArea = (unit: "stake" | "unstake") => {
    const isUnstake = unit === "unstake";
    const total = isUnstake ? stakeDec : Decimal.max(0, balanceDec.minus(maxFeeDec));
    const value = isUnstake ? unstakeAmount : stakeAmount;
    const after = isUnstake
      ? Decimal.max(0, stakeDec.minus(amountDec ?? 0))
      : Decimal.max(0, balanceDec.minus(amountDec ?? 0));
    const onChange = (next: string) => {
      const limited = limitDecimals(next);
      if (isUnstake) {
        setUnstakeAmount(limited);
        setUnstakeMax(false);
      } else {
        setStakeAmount(limited);
      }
    };
    return (
      <div className="space-y-3">
        <AmountWell
          label="Amount"
          value={value}
          onChange={onChange}
          unit={symbol}
          available={
            isUnstake ? `Staked ${amountText(stakeDec)}` : `Available ${amountText(balanceDec)}`
          }
          balanceAfter={
            isUnstake ? `Stake after ${amountText(after)}` : `Balance after ${amountText(after)}`
          }
          error={amountError}
        />
        <AmountPresets
          presets={[
            { label: "25%", value: presetAmount(total, 0.25) },
            { label: "50%", value: presetAmount(total, 0.5) },
            { label: "75%", value: presetAmount(total, 0.75) },
            {
              label: "Max",
              value: isUnstake ? stakeDec.toFixed() : presetAmount(total, 1),
            },
          ]}
          onPick={next => {
            if (isUnstake) {
              setUnstakeAmount(next);
              setUnstakeMax(next === stakeDec.toFixed());
            } else {
              setStakeAmount(next);
            }
          }}
        />
      </div>
    );
  };

  const errorCard = (() => {
    if (!flowError) return null;
    if (flowError === "unconfirmed") {
      return (
        <div className="space-y-2">
          <ErrorCard
            title="We could not confirm this yet"
            cause="Your wallet sent the transaction. Check it on the explorer before you try again."
          />
          <ExplorerTxLink href={explorer && txHash ? `${explorer}/tx/${txHash}` : undefined} />
        </div>
      );
    }
    if (flowError === "cooldown") {
      return (
        <ErrorCard title="You cannot unstake from this pool right now. The amount did not move. The network fee may still be charged." />
      );
    }
    return (
      <ErrorCard
        title={
          flowError === "rejected"
            ? "You cancelled in your wallet. Nothing moved."
            : `The ${VERB[flow]} did not go through. Nothing moved.`
        }
        onRetry={commit}
        retryLabel="Retry"
      />
    );
  })();

  const reviewRows = () => {
    const balanceAfter =
      flow === "stake"
        ? balanceDec.minus(amountDec ?? 0).minus(feeDec)
        : balanceDec.plus(amountDec ?? 0).minus(feeDec);
    if (flow === "claim") {
      return [
        { label: "You claim", value: amountText(pendingDec) },
        { label: "From", value: pool?.name ?? "" },
        { label: "Network fee", value: feeText },
        { label: "Balance after", value: amountText(Decimal.max(0, balanceAfter)) },
      ];
    }
    const rows = [
      {
        label: flow === "stake" ? "You stake" : "You unstake",
        value: exactAmount,
      },
      { label: "Pool", value: pool?.name ?? "" },
    ];
    if (flow === "unstake") {
      rows.push({
        label: "Stake after",
        value: amountText(Decimal.max(0, stakeDec.minus(amountDec ?? 0))),
      });
    }
    rows.push(
      { label: "Pending rewards claimed", value: amountText(pendingDec) },
      { label: "Network fee", value: feeText },
      { label: "Balance after", value: amountText(Decimal.max(0, balanceAfter)) }
    );
    if (flow === "stake" && pool) {
      rows.push({
        label: "Pool total after",
        value: amountText(new Decimal(formatEther(pool.stakedAmount)).plus(amountDec ?? 0)),
      });
    }
    return rows;
  };

  const renderBody = () => {
    if (!pool) return renderStatus();

    if (step === "result" && result) {
      return (
        <>
          <StepBar steps={steps} current={stepIndex} />
          <div className="prism-slab space-y-2 p-5" aria-live="polite">
            <p className="text-prism-panel-title text-prism-ink">{result.title}</p>
            <p className="text-prism-body text-prism-ink-2">{result.body}</p>
          </div>
          <ExplorerTxLink href={explorer && txHash ? `${explorer}/tx/${txHash}` : undefined} />
        </>
      );
    }

    if (step === "confirm") {
      return (
        <>
          <StepBar steps={steps} current={stepIndex} />
          <ConfirmBody phase={phase} verb={VERB[flow]} />
        </>
      );
    }

    if (step === "review") {
      return (
        <>
          <StepBar steps={steps} current={stepIndex} />
          <AmountWell
            label={
              flow === "stake" ? "You stake" : flow === "unstake" ? "You unstake" : "You claim"
            }
            value={
              flow === "claim" ? formatTokenAmount(pendingDec) : formatExactAmount(amountDec ?? 0)
            }
            unit={symbol}
            calm
            onEdit={
              flow === "claim"
                ? undefined
                : () => {
                    setFlowError(null);
                    setStep("amount");
                  }
            }
          />
          {errorCard}
          <ReviewSlab rows={reviewRows()} />
          {flow !== "claim" && <p className="text-prism-body text-prism-ink-2">{UNSTAKE_TERMS}</p>}
          <ComplianceCard />
          {flow !== "claim" && (
            <Checkbox checked={agreed} onCheckedChange={setAgreed} required>
              I understand this {VERB[flow]} also claims my pending rewards in this pool. (Required)
            </Checkbox>
          )}
        </>
      );
    }

    if (flow === "unstake") {
      return (
        <>
          <Button variant="ghost" className="-ml-1 self-start" onClick={backToDetails}>
            <ArrowLeft aria-hidden />
            Back to pool details
          </Button>
          <StepBar steps={steps} current={0} />
          {unstakeBlocked ? (
            <ErrorCard title="You cannot unstake from this pool right now." />
          ) : (
            amountArea("unstake")
          )}
          <Slab>
            <SlabRow label="Unstaking">
              <p className="mt-1 text-prism-body text-prism-ink">{UNSTAKE_TERMS}</p>
            </SlabRow>
          </Slab>
        </>
      );
    }

    // Pool details, which is also the stake Amount step (047 P22B-Select)
    return (
      <>
        {isWeb3Wallet && <StepBar steps={steps} current={0} />}
        {yourPosition}
        {isWeb3Wallet ? (
          amountArea("stake")
        ) : (
          <div className="space-y-3">
            <Notice variant="info">Connect your wallet to stake in this pool.</Notice>
            <Button variant="secondary" onClick={goToWallet}>
              Go to Wallet
            </Button>
          </div>
        )}
        {aboutPool}
      </>
    );
  };

  const renderFooter = () => {
    if (!pool) return undefined;
    if (step === "result") {
      return (
        <Button variant="secondary" size="lg" className="w-full" onClick={backToDetails}>
          Done
        </Button>
      );
    }
    if (step === "confirm") return undefined;
    if (step === "review") {
      const label =
        flow === "claim"
          ? `Claim ${amountText(pendingDec)}`
          : `${flow === "stake" ? "Stake" : "Unstake"} ${exactAmount}`;
      return (
        <CommitAction
          disabled={
            (flow !== "claim" && (!agreed || !amountValid)) ||
            flowError === "cooldown" ||
            // The wallet already sent a transaction: never offer a second one
            flowError === "unconfirmed"
          }
          onClick={commit}
        >
          {label}
        </CommitAction>
      );
    }
    if (flow === "unstake") {
      return (
        <>
          <TestnetLine />
          {!unstakeBlocked && (
            <Button
              size="lg"
              className="w-full"
              disabled={!amountValid}
              onClick={() => startFlow("unstake", "review")}
            >
              Review unstake
              <ArrowRight aria-hidden />
            </Button>
          )}
        </>
      );
    }
    return (
      <>
        <TestnetLine />
        {isWeb3Wallet && (
          <Button
            size="lg"
            className="w-full"
            disabled={!amountValid}
            onClick={() => startFlow("stake", "review")}
          >
            Review stake
            <ArrowRight aria-hidden />
          </Button>
        )}
      </>
    );
  };

  return (
    <>
      <SidePanel
        open={open}
        onOpenChange={onOpenChange}
        eyebrow={EYEBROW[flow]}
        title={
          pool ? (
            pool.name
          ) : (
            <>
              <span className="sr-only">
                {notFound
                  ? "Pool not found"
                  : poolQuery.isError
                    ? "Pool did not load"
                    : "Loading pool"}
              </span>
              {showSkeleton && (
                <span aria-hidden className="block h-5 w-48 rounded-full bg-prism-line" />
              )}
            </>
          )
        }
        byline={
          byline ??
          (showSkeleton ? (
            <span aria-hidden className="block h-3 w-32 rounded-full bg-prism-line" />
          ) : undefined)
        }
        art={pool ? <PoolArt url={pool.image?.url} /> : showSkeleton ? <span /> : undefined}
        calm={step !== "amount"}
        dismissible={step !== "confirm"}
        headerActions={
          pool && onDetails ? (
            <PoolMenu
              onShare={share}
              explorerUrl={explorer ? `${explorer}/address/${pool.address}` : undefined}
              creatorUrl={creatorUrl}
              onChangeImage={isCreator ? () => setImageOpen(true) : undefined}
            />
          ) : undefined
        }
        footer={renderFooter()}
      >
        {renderBody()}
      </SidePanel>
      {isCreator && (
        <ImageUploadModal
          isOpen={imageOpen}
          onClose={() => setImageOpen(false)}
          onUploadSuccess={fileId => setPoolImage(fileId)}
          currentImageUrl={pool?.image?.url ?? undefined}
        />
      )}
    </>
  );
}
