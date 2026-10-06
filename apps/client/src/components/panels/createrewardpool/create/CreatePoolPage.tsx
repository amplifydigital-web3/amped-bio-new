import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useChainId } from "wagmi";
import { useNavigate } from "react-router";
import { ArrowRight, Coins, ExternalLink } from "lucide-react";
import { Button, EmptyState, Notice } from "@repo/ui";
import { getChainConfig } from "@repo/web3";
import { useWalletContext } from "@/contexts/WalletContext";
import { useEditor } from "@/contexts/EditorContext";
import { Eyebrow, TestnetLine } from "../../explore/pool-panel/sections";
import { creatorPoolSchema, type CreatorPoolFormValues } from "../types";
import { COPY, DEFAULT_CREATOR_SHARE, INITIAL_STAKE } from "./copy";
import { CreatePoolFlow, type FlowStep } from "./CreatePoolFlow";
import type { PoolImage } from "./PoolImageField";
import { PoolPreviewCard, type PreviewValues } from "./PoolPreviewCard";
import { useCreatePoolFee, useLaunchPool, type LaunchState } from "./useLaunchPool";

type CreatePool = Parameters<typeof useLaunchPool>[0]["createPool"];

// The launch is under way and the person may close the panel (066 I06)
const IN_FLIGHT: LaunchState["phase"][] = ["chain", "unknown", "saving", "sync-failed"];

function HowPoolsWork() {
  return (
    <section className="prism-glass-clear space-y-3 !rounded-prism-21 p-[21px] font-prism">
      <Eyebrow>{COPY.howEyebrow}</Eyebrow>
      <p className="text-prism-body text-prism-ink-2">{COPY.how}</p>
      <TestnetLine />
    </section>
  );
}

/**
 * Screen Review 065 and 066: My Pool for a creator without a pool. The
 * context field shows the live preview card and How pools work; the create
 * flow runs in the value panel. On mobile the page is the Set up your pool
 * empty state and the flow is a full screen sheet.
 */
export function CreatePoolPage({
  createPool,
  onLaunchingChange,
  onLaunched,
  staleNotice,
  onDismissStale,
}: {
  createPool: CreatePool;
  // True from the first signature until the result is dismissed, so the
  // dashboard does not replace the flow while it is open
  onLaunchingChange: (launching: boolean) => void;
  // The pool exists: read its address so My Pool shows the dashboard
  onLaunched: () => Promise<unknown>;
  staleNotice: boolean;
  onDismissStale: () => void;
}) {
  const chainId = useChainId();
  const chain = getChainConfig(chainId);
  const symbol = chain?.nativeCurrency.symbol ?? "tREVO";
  const explorer = chain?.blockExplorers?.default?.url;
  const wallet = useWalletContext();
  const { profile, setActivePanel } = useEditor();
  const navigate = useNavigate();

  const methods = useForm<CreatorPoolFormValues>({
    resolver: zodResolver(creatorPoolSchema),
    defaultValues: {
      poolName: "",
      poolDescription: "",
      initialStake: Number(INITIAL_STAKE),
      creatorFee: DEFAULT_CREATOR_SHARE,
      stakingTiers: [],
    },
    // 065 I07: validate on blur, then live once a field was touched
    mode: "onTouched",
  });

  // The flow opens by itself on desktop (065 I01); mobile starts at the empty state
  const [open, setOpen] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(min-width: 640px)").matches
  );
  const [step, setStep] = useState<FlowStep>("amount");
  const [image, setImage] = useState<PoolImage | null>(null);

  const {
    state: launch,
    launch: runLaunch,
    retry,
    reset,
  } = useLaunchPool({
    chainId,
    account: wallet.address,
    createPool,
  });

  const values = methods.watch();
  const share = Number.isFinite(values.creatorFee) ? values.creatorFee : DEFAULT_CREATOR_SHARE;
  const { fee, refetch: refetchFee } = useCreatePoolFee({
    chainId,
    account: wallet.address,
    name: values.poolName.trim(),
    share,
    enabled: open && step === "review" && launch.phase === "idle",
  });

  const preview: PreviewValues = useMemo(
    () => ({
      name: values.poolName,
      description: values.poolDescription,
      share,
      image: image?.preview ?? null,
      creatorName: profile.name,
      handle: profile.handle,
      avatar: profile.photoUrl,
      symbol,
    }),
    [values.poolName, values.poolDescription, share, image, profile, symbol]
  );

  useEffect(() => {
    onLaunchingChange(launch.phase !== "idle" && launch.phase !== "failed");
  }, [launch.phase, onLaunchingChange]);

  const openPool = async () => {
    await onLaunched();
    setOpen(false);
    reset();
  };

  // Closed while the launch was running: when it lands, show the dashboard
  useEffect(() => {
    if (!open && launch.phase === "done") void openPool();
  }, [open, launch.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && launch.phase === "failed") {
      reset();
      setStep("review");
    }
  };

  const inFlight = IN_FLIGHT.includes(launch.phase);
  const hash = "hash" in launch ? launch.hash : undefined;
  const poolLink =
    launch.phase === "done" && launch.poolAddress
      ? `${import.meta.env.VITE_LANDINGPAGE_URL ?? "https://amped.bio"}/i/pools/${launch.poolAddress}`
      : undefined;

  const setUp = (
    <section className="prism-glass-clear !rounded-prism-21">
      <EmptyState
        icon={Coins}
        title={COPY.emptyTitle}
        description={COPY.emptyBody}
        action={
          <Button size="lg" onClick={() => setOpen(true)}>
            Set up pool
            <ArrowRight aria-hidden />
          </Button>
        }
      />
    </section>
  );

  return (
    <FormProvider {...methods}>
      <div className="mx-auto w-full max-w-[759px] space-y-[21px] px-4 py-5 font-prism sm:mx-0 sm:px-[21px]">
        {inFlight && !open && (
          <Notice variant="info" role="status">
            <p>Your pool is being created.</p>
            {explorer && hash && (
              <Button asChild variant="ghost" className="-ml-3">
                <a href={`${explorer}/tx/${hash}`} target="_blank" rel="noopener noreferrer">
                  View on explorer
                  <ExternalLink aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </Button>
            )}
          </Notice>
        )}

        {/* Mobile: the empty state is the page; the flow is a full screen sheet */}
        <div className="space-y-[21px] sm:hidden">
          {!inFlight && setUp}
          <HowPoolsWork />
        </div>

        {/* Desktop context field: what fans will see */}
        <div className="hidden space-y-[21px] sm:block">
          {!open && !inFlight && setUp}
          <div className="flex max-w-[495px] items-baseline justify-between gap-3">
            <Eyebrow>Pool preview</Eyebrow>
            <span className="text-prism-meta text-prism-ink-2">How fans will see it</span>
          </div>
          <PoolPreviewCard
            values={preview}
            calm={open && (step === "review" || launch.phase !== "idle")}
          />
          <HowPoolsWork />
        </div>
      </div>

      <CreatePoolFlow
        open={open}
        onOpenChange={onOpenChange}
        step={step}
        onStepChange={setStep}
        image={image}
        onImageChange={setImage}
        preview={preview}
        symbol={symbol}
        chainName={chain?.name ?? "Libertas Testnet"}
        explorer={explorer}
        balanceWei={wallet.balance?.data?.value ?? 0n}
        balanceLoading={!wallet.balance?.data && !!wallet.balance?.isLoading}
        walletReady={wallet.isWeb3Wallet}
        fee={fee}
        onRetryFee={() => void refetchFee()}
        launch={launch}
        onLaunch={() => {
          const data = methods.getValues();
          void runLaunch({
            name: data.poolName.trim(),
            description: data.poolDescription.trim(),
            share: data.creatorFee,
            imageFileId: image?.fileId ?? null,
          });
        }}
        onRetryLaunch={retry}
        onResetLaunch={reset}
        onOpenPool={() => void openPool()}
        poolLink={poolLink}
        staleNotice={staleNotice}
        onDismissStale={onDismissStale}
        onGetTrevo={() => {
          setActivePanel("wallet");
          navigate("/wallet");
        }}
      />
    </FormProvider>
  );
}
