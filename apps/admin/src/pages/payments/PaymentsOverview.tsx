import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleSlash, ExternalLink, PauseCircle } from "lucide-react";
import { toast } from "sonner";
import { Button, ErrorCard, Input, Notice, Skeleton, Textarea, trpc } from "@repo/ui";
import { formatBps, formatUsdcUnits } from "@repo/constants";
import { ConfirmDialog, Eyebrow } from "../../kit/parts";
import { SlabMessageRow, SlabTable, rowClass, tdClass, thClass } from "../../kit/Slab";
import { WordBadge } from "../../kit/WordBadge";
import { formatDay, formatDayTime, shortHex } from "../../kit/format";
import { DraftSheet, ReviewSheet } from "./ChangeSheet";
import {
  PaymentsNav,
  StatusBadge,
  WhereBadge,
  who,
  type PaymentChange,
  type PaymentsOverviewData,
  type PaymentsViewer,
} from "./shared";

// Board a1, Payments Overview (Build Board #50, spec docs/features/ampedpay.md 3.8). Status
// and Pause, changes waiting on approval, the key values in force, and the contract, Safe
// and Coinbase accounts read live from Base. Pause applies at once by one payments admin:
// on the server, or on the contract through the pauser account. Resume is drafted and
// approved by a second payments admin; the contract resume is then executed by the Safe
// (spec 3.5, decision 2).

function minutes(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds / 60} minutes` : `${seconds} seconds`;
}

const PAUSE_COPY = {
  server: {
    title: "Pause payments?",
    body: "New quotes and submits stop at once. Payments already signed and submitted finish. Resume needs a second payments admin.",
    confirm: "Pause payments",
    done: "Payments paused",
  },
  contract: {
    title: "Pause the contract?",
    body: "The pauser account sends pause() to AmpedPay. Every pay and refund reverts from the next block. Resume needs a second payments admin and the Safe owners.",
    confirm: "Pause the contract",
    done: "Pause sent. The contract stops taking payments from the next block.",
  },
} as const;

function PauseDialog({
  kind,
  open,
  onOpenChange,
}: {
  kind: "server" | "contract";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const copy = PAUSE_COPY[kind];
  const handlers = {
    onSuccess: () => {
      toast.success(copy.done);
      void queryClient.invalidateQueries({ queryKey: trpc.admin.payments.pathKey() });
      setReason("");
      setCode("");
      onOpenChange(false);
    },
    onError: (failure: { message: string }) => {
      setCode("");
      setError(failure.message);
    },
  };
  const pauseServer = useMutation({ ...trpc.admin.payments.pause.mutationOptions(), ...handlers });
  const pauseContract = useMutation({
    ...trpc.admin.payments.pauseContract.mutationOptions(),
    ...handlers,
  });
  const pause = kind === "server" ? pauseServer : pauseContract;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => {
        if (!next) setError(undefined);
        onOpenChange(next);
      }}
      title={copy.title}
      body={copy.body}
      confirmLabel={copy.confirm}
      destructive
      busy={pause.isPending}
      onConfirm={() => {
        setError(undefined);
        if (reason.trim().length < 3) return setError("Give a reason for the pause.");
        if (!/^\d{6}$/.test(code))
          return setError("Enter the 6 digit code from your authenticator app.");
        pause.mutate({ reason: reason.trim(), code });
      }}
    >
      <div className="space-y-4 font-prism">
        <Textarea
          label="Reason (Required)"
          rows={2}
          maxLength={500}
          value={reason}
          onChange={event => setReason(event.target.value)}
        />
        <Input
          label="Two factor code (Required)"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={event => setCode(event.target.value.replace(/\D/g, ""))}
          {...(error ? { error } : {})}
        />
      </div>
    </ConfirmDialog>
  );
}

function StatusCard({
  data,
  viewer,
  onResume,
  onResumeContract,
}: {
  data: PaymentsOverviewData;
  viewer: PaymentsViewer | undefined;
  onResume: () => void;
  onResumeContract: () => void;
}) {
  const [pausing, setPausing] = useState<"server" | "contract" | null>(null);
  const state = !data.enabled
    ? "off"
    : data.contractPaused
      ? "contract"
      : data.paused
        ? "paused"
        : "on";
  const canChange = !!viewer?.canChange;
  const twoFactorOn = !!viewer?.twoFactorOn;
  const contractLive = data.contract.chainReads;

  return (
    <section
      aria-labelledby="payments-status-title"
      className="prism-glass-clear flex flex-col gap-[13px] !rounded-prism-21 p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Eyebrow as="p">Status</Eyebrow>
          <h2
            id="payments-status-title"
            className="flex items-center gap-2 text-prism-panel-title text-prism-ink"
          >
            {state === "on" ? (
              <CheckCircle2 aria-hidden className="h-5 w-5 text-prism-success" />
            ) : state === "paused" || state === "contract" ? (
              <PauseCircle aria-hidden className="h-5 w-5 text-prism-warning-ink" />
            ) : (
              <CircleSlash aria-hidden className="h-5 w-5 text-prism-ink-2" />
            )}
            {state === "on"
              ? "Taking payments"
              : state === "contract"
                ? "The contract is paused"
                : state === "paused"
                  ? "Payments are paused"
                  : "Off in this environment"}
          </h2>
          <p className="max-w-[72ch] text-prism-body text-prism-ink-2">
            {state === "off"
              ? "PAYMENTS_ENABLED is false, so fans see no checkout. Settings can still be changed so they are ready at launch."
              : "Pause stops new payments at once. Resume needs a second payments admin; the contract resume also needs the Safe owners."}
          </p>
          <dl className="flex flex-wrap gap-x-5 gap-y-1 pt-1 text-prism-meta">
            <div className="flex gap-1">
              <dt className="text-prism-ink-2">Server:</dt>
              <dd className="font-semibold text-prism-ink">{data.paused ? "Paused" : "Open"}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-prism-ink-2">Contract:</dt>
              <dd className="font-semibold text-prism-ink">
                {!data.contract.deployed
                  ? "Not deployed"
                  : !contractLive
                    ? "Not read"
                    : data.contractPaused
                      ? "Paused"
                      : "Open"}
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WordBadge tone="ink">
            {data.environment === "production" ? "Production" : "Staging"}, {data.network}
          </WordBadge>
          {canChange && !data.paused && (
            <Button
              variant="destructive"
              onClick={() => setPausing("server")}
              disabled={!twoFactorOn}
            >
              Pause payments
            </Button>
          )}
          {canChange && data.paused && (
            <Button onClick={onResume} disabled={!twoFactorOn}>
              Resume payments
            </Button>
          )}
          {canChange && contractLive && !data.contractPaused && (
            <Button
              variant="destructive"
              onClick={() => setPausing("contract")}
              disabled={!twoFactorOn || !data.accounts.pauser.configured}
              title={
                data.accounts.pauser.configured
                  ? undefined
                  : "The pauser account is not set up. Pause from the Safe."
              }
            >
              Pause the contract
            </Button>
          )}
          {canChange && contractLive && data.contractPaused && (
            <Button onClick={onResumeContract} disabled={!twoFactorOn}>
              Resume the contract
            </Button>
          )}
        </div>
      </div>
      <PauseDialog
        kind="server"
        open={pausing === "server"}
        onOpenChange={next => setPausing(next ? "server" : null)}
      />
      <PauseDialog
        kind="contract"
        open={pausing === "contract"}
        onOpenChange={next => setPausing(next ? "contract" : null)}
      />
    </section>
  );
}

function WaitingTable({
  changes,
  viewer,
  onReview,
}: {
  changes: PaymentChange[];
  viewer: PaymentsViewer | undefined;
  onReview: (change: PaymentChange) => void;
}) {
  return (
    <section aria-labelledby="payments-waiting-title" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="payments-waiting-title" className="text-prism-panel-title text-prism-ink">
          Waiting on approval
        </h2>
        <p className="text-prism-meta text-prism-ink-2">
          A different payments admin approves. On chain changes then wait for the Safe owners.
          Drafts expire after 7 days.
        </p>
      </div>
      <SlabTable label="Changes waiting on approval">
        <thead>
          <tr>
            <th scope="col" className={thClass}>
              Setting
            </th>
            <th scope="col" className={thClass}>
              Change
            </th>
            <th scope="col" className={thClass}>
              Where
            </th>
            <th scope="col" className={thClass}>
              Drafted by
            </th>
            <th scope="col" className={thClass}>
              Status
            </th>
            <th scope="col" aria-label="Action" className={thClass} />
          </tr>
        </thead>
        {changes.length === 0 ? (
          <SlabMessageRow columns={6}>
            <p className="px-4 py-5 text-prism-body text-prism-ink-2">Nothing is waiting.</p>
          </SlabMessageRow>
        ) : (
          <tbody>
            {changes.map(change => (
              <tr key={change.id} className={rowClass}>
                <td className={tdClass}>
                  <span className="text-prism-label font-semibold text-prism-ink">
                    {change.label}
                  </span>
                </td>
                <td className={`${tdClass} tabular-nums text-prism-ink-2`}>
                  {change.oldText} to {change.newText}
                </td>
                <td className={tdClass}>
                  <WhereBadge target={change.target} />
                </td>
                <td className={`${tdClass} text-prism-ink-2`}>
                  {who(change.draftedBy, change.draftedById)}
                  <span className="block text-prism-meta">{formatDayTime(change.createdAt)}</span>
                </td>
                <td className={tdClass}>
                  <StatusBadge change={change} />
                  {change.scheduled && change.effectiveAt && (
                    <span className="block text-prism-meta text-prism-ink-2">
                      Applies {formatDay(change.effectiveAt)}
                    </span>
                  )}
                  {change.expiresAt && (
                    <span className="block text-prism-meta text-prism-ink-2">
                      Expires {formatDay(change.expiresAt)}
                    </span>
                  )}
                </td>
                <td className={`${tdClass} text-right`}>
                  {viewer?.canChange && change.status === "draft" && (
                    <Button
                      variant={viewer.userId === change.draftedById ? "secondary" : "default"}
                      onClick={() => onReview(change)}
                    >
                      {viewer.userId === change.draftedById ? "Your draft" : "Review"}
                    </Button>
                  )}
                  {change.status === "proposed" && (
                    <Button variant="secondary" onClick={() => onReview(change)}>
                      Track
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        )}
      </SlabTable>
    </section>
  );
}

function KeyCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; target: string }[];
}) {
  return (
    <section aria-label={title} className="prism-glass-clear !rounded-prism-21 p-5">
      <h3 className="text-prism-label font-bold text-prism-ink">{title}</h3>
      <dl className="mt-3 divide-y divide-prism-line">
        {rows.map(row => (
          <div key={row.label} className="flex min-h-touch items-center justify-between gap-3 py-2">
            <dt className="text-prism-label text-prism-ink-2">{row.label}</dt>
            <dd className="flex items-center gap-2 text-right text-prism-label font-semibold tabular-nums text-prism-ink">
              {row.value}
              <WhereBadge target={row.target} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function KeySettings({ data }: { data: PaymentsOverviewData }) {
  const s = data.settings;
  return (
    <section aria-labelledby="payments-key-title" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="payments-key-title" className="text-prism-panel-title text-prism-ink">
          Key settings
        </h2>
        <Link
          to="/payments/settings"
          className="prism-focus inline-flex min-h-touch items-center text-prism-label font-semibold text-prism-nav underline-offset-4 hover:underline"
        >
          All settings
        </Link>
      </div>
      <div className="grid gap-[13px] lg:grid-cols-3">
        <KeyCard
          title="Fees and split"
          rows={[
            { label: "Platform fee", value: formatBps(s.platformFeeBps), target: "server" },
            { label: "Fee floor", value: formatBps(s.feeFloorBps), target: "contract" },
            { label: "Fee ceiling", value: "10.00%", target: "fixed" },
            { label: "Creator minimum", value: formatBps(s.minCreatorBps), target: "contract" },
          ]}
        />
        <KeyCard
          title="Limits"
          rows={[
            {
              label: "One time price",
              value: `${formatUsdcUnits(s.oneTimePriceMin, false)} to ${formatUsdcUnits(s.oneTimePriceMax)}`,
              target: "server",
            },
            {
              label: "Contract per payment",
              value: `${formatUsdcUnits(s.minPayment, false)} to ${formatUsdcUnits(s.maxPayment)}`,
              target: "contract",
            },
            {
              label: "Per account per day",
              value: `${s.purchasesPerDayPerAccount} payments, ${formatUsdcUnits(s.purchaseUsdcPerDayPerAccount)}`,
              target: "server",
            },
            { label: "Quote window", value: minutes(s.quoteWindowSeconds), target: "server" },
          ]}
        />
        <KeyCard
          title="Promoters and refunds"
          rows={[
            {
              label: "Promoter share",
              value: `${s.promoterShareMinBps / 100}% to ${s.promoterShareMaxBps / 100}%`,
              target: "server",
            },
            { label: "Refund window", value: `${s.refundWindowDays} days`, target: "server" },
            {
              label: "Pause a promoter at",
              value: `${s.promoterRefundPauseRateBps / 100}% refunds in 30 days`,
              target: "server",
            },
            {
              label: "Pilot",
              value: s.pilotOnly ? `On, ${s.pilotCreators} creators` : "Off",
              target: "server",
            },
          ]}
        />
      </div>
    </section>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-touch items-center justify-between gap-3 py-2">
      <dt className="text-prism-label text-prism-ink-2">{label}</dt>
      <dd className="text-right text-prism-label font-semibold tabular-nums text-prism-ink">
        {children}
      </dd>
    </div>
  );
}

function NotSetUp() {
  return <WordBadge tone="warning">Not set up</WordBadge>;
}

function ExplorerLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="prism-focus mt-2 inline-flex min-h-touch items-center gap-1 text-prism-label font-semibold text-prism-nav underline-offset-4 hover:underline"
    >
      {children}
      <ExternalLink aria-hidden className="h-4 w-4" />
    </a>
  );
}

type AccountData = PaymentsOverviewData["accounts"]["pauser"];

/** A Coinbase account: Not set up, Not answering, or its address with its ETH. */
function AccountValue({ account, showEth }: { account: AccountData; showEth?: boolean }) {
  if (!account.configured) return <NotSetUp />;
  if (!account.reachable) return <WordBadge tone="danger">Not answering</WordBadge>;
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="font-mono text-prism-meta" title={account.address}>
        {shortHex(account.address)}
      </span>
      {showEth && (
        <WordBadge tone={Number(account.balanceEth) > 0 ? "success" : "danger"}>
          {Number(account.balanceEth).toLocaleString("en-US", { maximumFractionDigits: 4 })} ETH
        </WordBadge>
      )}
    </span>
  );
}

function YesNo({ value, yes, no }: { value: boolean | null; yes: string; no: string }) {
  if (value === null) return <span className="text-prism-ink-2">Not read</span>;
  return <WordBadge tone={value ? "success" : "danger"}>{value ? yes : no}</WordBadge>;
}

function Accounts({ data }: { data: PaymentsOverviewData }) {
  const relayer = data.accounts.relayer;
  const explorer = data.explorerUrl;
  const contract = data.contract;
  const safe = data.safe;
  return (
    <section aria-labelledby="payments-accounts-title" className="space-y-3">
      <h2 id="payments-accounts-title" className="text-prism-panel-title text-prism-ink">
        Contract and accounts
      </h2>
      {contract.readFailed && (
        <Notice variant="warning" title="The contract did not answer.">
          <p>Values on this page show the deploy defaults until the next read.</p>
        </Notice>
      )}
      <div className="grid gap-[13px] lg:grid-cols-3">
        <section aria-label="AmpedPay contract" className="prism-glass-clear !rounded-prism-21 p-5">
          <h3 className="text-prism-label font-bold text-prism-ink">AmpedPay</h3>
          <dl className="mt-3 divide-y divide-prism-line">
            <Line label="Address">
              {contract.address ? (
                <span className="font-mono" title={contract.address}>
                  {shortHex(contract.address)}
                </span>
              ) : (
                <WordBadge tone="neutral">Not deployed</WordBadge>
              )}
            </Line>
            {contract.chainReads && (
              <>
                <Line label="State">
                  <YesNo value={contract.paused === false} yes="Open" no="Paused" />
                </Line>
                <Line label="Upgrades owned by the Safe">
                  <YesNo value={contract.upgradesBySafe} yes="Yes" no="No" />
                </Line>
                <Line label="Safe holds admin roles">
                  <YesNo
                    value={
                      contract.safeRoles
                        ? contract.safeRoles.admin &&
                          contract.safeRoles.params &&
                          contract.safeRoles.pauser
                        : null
                    }
                    yes="Yes"
                    no="Missing"
                  />
                </Line>
                {contract.implementation && (
                  <Line label="Implementation">
                    <span className="font-mono" title={contract.implementation}>
                      {shortHex(contract.implementation)}
                    </span>
                  </Line>
                )}
              </>
            )}
            <Line label="Values shown">
              {contract.chainReads ? "Read from Base" : "Deploy defaults"}
            </Line>
          </dl>
          {contract.address && explorer && (
            <ExplorerLink href={`${explorer}/address/${contract.address}`}>
              View on the explorer
            </ExplorerLink>
          )}
          {!contract.address && (
            <p className="mt-2 text-prism-meta text-prism-ink-2">
              Deploy from packages/contracts, then set AMPEDPAY_ADDRESS.
            </p>
          )}
        </section>

        <section aria-label="Safe" className="prism-glass-clear !rounded-prism-21 p-5">
          <h3 className="text-prism-label font-bold text-prism-ink">Safe</h3>
          <dl className="mt-3 divide-y divide-prism-line">
            <Line label="Address">
              {safe.address ? (
                <span className="font-mono" title={safe.address}>
                  {shortHex(safe.address)}
                </span>
              ) : (
                <NotSetUp />
              )}
            </Line>
            <Line label="Signatures needed">
              {safe.threshold}
              {!safe.chainReads && safe.address && (
                <span className="block text-prism-meta font-normal text-prism-ink-2">
                  Planned, not read
                </span>
              )}
            </Line>
            {safe.chainReads && safe.nonce !== null && (
              <Line label="Next nonce">{String(safe.nonce)}</Line>
            )}
            <Line label="Proposals">
              {safe.proposals === "service" ? (
                "Queued in the Safe app"
              ) : (
                <WordBadge tone="warning">Owner submits by hand</WordBadge>
              )}
            </Line>
          </dl>
          {safe.owners.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-prism-meta text-prism-ink-2">Owners, changed in the Safe app</p>
              {safe.owners.map(owner => (
                <p key={owner} className="font-mono text-prism-meta text-prism-ink" title={owner}>
                  {shortHex(owner)}
                </p>
              ))}
            </div>
          )}
          {safe.url && <ExplorerLink href={safe.url}>Open in Safe</ExplorerLink>}
        </section>

        <section aria-label="Coinbase accounts" className="prism-glass-clear !rounded-prism-21 p-5">
          <h3 className="text-prism-label font-bold text-prism-ink">Coinbase accounts</h3>
          <dl className="mt-3 divide-y divide-prism-line">
            <Line label="Relayer">
              {!relayer.configured ? (
                <NotSetUp />
              ) : relayer.reachable ? (
                <WordBadge
                  tone={relayer.stopped ? "danger" : relayer.alarm ? "warning" : "success"}
                >
                  {Number(relayer.balanceEth).toLocaleString("en-US", { maximumFractionDigits: 4 })}{" "}
                  ETH
                </WordBadge>
              ) : (
                <WordBadge tone="danger">Not answering</WordBadge>
              )}
            </Line>
            <Line label="Split signer">
              <AccountValue account={data.accounts.splitSigner} />
            </Line>
            <Line label="Pauser">
              <AccountValue account={data.accounts.pauser} showEth />
            </Line>
            <Line label="Safe proposer">
              <AccountValue account={data.accounts.proposer} />
            </Line>
          </dl>
          <p className="mt-2 text-prism-meta text-prism-ink-2">
            Policies change in the Coinbase Developer Platform.
          </p>
        </section>
      </div>
    </section>
  );
}

export function PaymentsOverview() {
  const viewer = useQuery(trpc.admin.payments.viewer.queryOptions());
  const overview = useQuery({
    ...trpc.admin.payments.overview.queryOptions(),
    refetchInterval: 30_000,
  });
  const settings = useQuery(trpc.admin.payments.settings.queryOptions());
  const [review, setReview] = useState<PaymentChange | null>(null);
  const [resuming, setResuming] = useState<"server" | "contract" | null>(null);

  if (overview.isPending) {
    return (
      <div aria-busy className="space-y-[13px] font-prism">
        <Skeleton delayMs={400} className="h-[120px] w-full !rounded-prism-21" />
        <Skeleton delayMs={400} className="h-[200px] w-full !rounded-prism-21" />
      </div>
    );
  }
  if (overview.isError) {
    return (
      <ErrorCard
        title="Payments did not load"
        cause="Try again in a moment."
        retryLabel="Retry"
        onRetry={() => void overview.refetch()}
      />
    );
  }

  const data = overview.data;
  const pausedRow = settings.data?.items.find(item => item.id === "payments_paused") ?? null;
  const contractPausedRow =
    settings.data?.items.find(item => item.id === "contract_paused") ?? null;

  return (
    <div className="space-y-[21px] font-prism">
      <PaymentsNav />
      {viewer.data && !viewer.data.canChange && (
        <Notice variant="info" title="You can view payments.">
          <p>Changes need the payments admin role.</p>
        </Notice>
      )}
      {viewer.data?.canChange && !viewer.data.twoFactorOn && (
        <Notice variant="warning" title="Turn on two factor to change payments.">
          <p>Every payments change asks for a code. Set it up in your Amped.Bio account.</p>
        </Notice>
      )}
      <StatusCard
        data={data}
        viewer={viewer.data}
        onResume={() => setResuming("server")}
        onResumeContract={() => setResuming("contract")}
      />
      <WaitingTable changes={data.waiting} viewer={viewer.data} onReview={setReview} />
      <section aria-labelledby="payments-today-title" className="space-y-3">
        <h2 id="payments-today-title" className="text-prism-panel-title text-prism-ink">
          Today
        </h2>
        <Notice variant="info" title="No payments yet.">
          <p>Payments, volume and platform fees appear here once checkout ships.</p>
        </Notice>
      </section>
      <KeySettings data={data} />
      <Accounts data={data} />
      <ReviewSheet
        change={review}
        viewer={viewer.data}
        explorerUrl={data.explorerUrl}
        open={review !== null}
        onOpenChange={open => !open && setReview(null)}
      />
      <DraftSheet
        row={pausedRow}
        open={resuming === "server"}
        onOpenChange={open => setResuming(open ? "server" : null)}
        presetValue="false"
      />
      <DraftSheet
        row={contractPausedRow}
        open={resuming === "contract"}
        onOpenChange={open => setResuming(open ? "contract" : null)}
        presetValue="false"
      />
    </div>
  );
}
