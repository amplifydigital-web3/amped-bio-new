import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatEther, formatUnits } from "viem";
import { CheckCircle2, CircleSlash, ExternalLink, PauseCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorCard,
  Input,
  Label,
  Notice,
  Skeleton,
  trpc,
  type RouterOutputs,
} from "@repo/ui";
import { CopyButton } from "../kit/CopyButton";
import { ConfirmDialog, Eyebrow, FieldError, FilterChips, retryToast } from "../kit/parts";
import {
  SlabMessageRow,
  SlabSkeletonRows,
  SlabTable,
  rowClass,
  tdClass,
  thClass,
} from "../kit/Slab";
import { WordBadge, type BadgeTone } from "../kit/WordBadge";
import { formatCount, formatDayTime, shortHex } from "../kit/format";

// Build Board #29 USDC-3, spec docs/features/usdc-wallet-onramp.md 3.8.
// Amped.Bio pays Base gas for every gasless USDC send. This page shows the
// relayer and its runway, the gas ledger, top ups, today's sends against the
// limits, screening denies, the Pause USDC sends switch, and Buy USDC through
// Coinbase with its Pause Buy USDC switch (USDC-6). Handles only,
// never fan email or names. Pausing is a platform wide money setting, so it
// changes through an explicit button with a confirm (087 D1).

type Overview = RouterOutputs["admin"]["money"]["overview"];
type OnrampOverview = RouterOutputs["admin"]["money"]["onrampOverview"];
type SendFilter = "all" | "confirmed" | "failed" | "refused";
type OnrampFilter = "all" | "success" | "processing" | "failed" | "expired";

function eth(wei: string | bigint | null | undefined, digits = 6): string {
  if (wei === null || wei === undefined) return "None";
  const value = Number(formatEther(BigInt(wei)));
  return `${value.toLocaleString("en-US", { maximumFractionDigits: digits })} ETH`;
}

function usd(wei: string | bigint, price: number | null): string | null {
  if (price === null) return null;
  const value = Number(formatEther(BigInt(wei))) * price;
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function usdc(units: string): string {
  return `${Number(formatUnits(BigInt(units), 6)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} USDC`;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  confirmed: "success",
  submitted: "nav",
  submitting: "nav",
  screened: "neutral",
  failed: "danger",
  refused: "warning",
  expired: "neutral",
};

const ONRAMP_TONE: Record<string, BadgeTone> = {
  success: "success",
  processing: "nav",
  pending_payment: "nav",
  pending_verification: "nav",
  created: "neutral",
  failed: "danger",
  canceled: "neutral",
  expired: "neutral",
};

const ONRAMP_STATUS_LABEL: Record<string, string> = {
  created: "Created",
  pending_verification: "Verifying",
  pending_payment: "Paying",
  processing: "Sending",
  success: "Done",
  failed: "Failed",
  canceled: "Canceled",
  expired: "Expired",
};

const ONRAMP_MODE_LABEL: Record<string, string> = {
  coinbase_account: "Coinbase account",
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
};

function Tile({
  label,
  value,
  lines,
}: {
  label: string;
  value: React.ReactNode;
  lines: React.ReactNode[];
}) {
  return (
    <section aria-label={label} className="prism-glass-clear min-h-[144px] !rounded-prism-21 p-5">
      <Eyebrow as="h3">{label}</Eyebrow>
      <p className="mt-3 text-prism-card-title tabular-nums text-prism-ink">{value}</p>
      <div className="mt-2 space-y-1 text-prism-meta tabular-nums text-prism-ink-2">
        {lines.map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>
    </section>
  );
}

function relayerNotice(data: Overview) {
  const relayer = data.relayer;
  if (!relayer.configured) {
    return (
      <Notice variant="warning" title="The relayer is not set up in this environment.">
        <p>
          Create the CDP Server Wallet account, attach the policy and fund it, then set the CDP
          variables (docs/ops/cdp-policy.md). USDC sends stay off until then.
        </p>
      </Notice>
    );
  }
  if (!relayer.reachable) {
    return (
      <Notice variant="error" role="alert" title="The relayer did not answer.">
        <p>
          Coinbase or the Base RPC could not be reached. Sends show the paused line until it
          answers.
        </p>
      </Notice>
    );
  }
  if (relayer.stopped) {
    return (
      <Notice
        variant="error"
        role="alert"
        title="Sends are stopped: relayer gas is below the stop line."
      >
        <p>
          Balance {eth(relayer.balanceWei)}, stop line {data.gasLines.stopEth} ETH. Fans see the
          paused line. Top up the relayer from the treasury.
        </p>
      </Notice>
    );
  }
  if (relayer.alarm) {
    return (
      <Notice variant="warning" title="Relayer gas is low.">
        <p>
          Balance {eth(relayer.balanceWei)}, alarm line {data.gasLines.alarmEth} ETH. Sends stop at{" "}
          {data.gasLines.stopEth} ETH.
        </p>
      </Notice>
    );
  }
  return null;
}

function StatusCard({ data }: { data: Overview }) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<null | boolean>(null);
  const setPaused = useMutation({
    ...trpc.admin.money.setPaused.mutationOptions(),
    onSuccess: (_result, input) => {
      setConfirm(null);
      toast.success(input.paused ? "USDC sends paused" : "USDC sends resumed");
      void queryClient.invalidateQueries({ queryKey: trpc.admin.money.overview.queryKey() });
    },
    onError: (_error, input) => {
      setConfirm(null);
      retryToast(input.paused ? "Sends did not pause" : "Sends did not resume", () =>
        setPaused.mutate(input)
      );
    },
  });

  const state = !data.enabled ? "off" : data.paused ? "paused" : "on";
  const screening = [
    data.screening.circle && "Circle Compliance Engine",
    data.screening.oracle && "Chainalysis oracle",
    data.screening.denylist > 0 && `denylist (${data.screening.denylist})`,
  ].filter(Boolean);

  return (
    <section
      aria-labelledby="usdc-status-title"
      className="prism-glass-clear flex flex-col gap-[13px] !rounded-prism-21 p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 id="usdc-status-title" className="text-prism-panel-title text-prism-ink">
            USDC sends on {data.network}
          </h2>
          <p className="flex items-center gap-2 text-prism-label font-semibold text-prism-ink">
            {state === "on" ? (
              <CheckCircle2 aria-hidden className="h-5 w-5 text-prism-success" />
            ) : state === "paused" ? (
              <PauseCircle aria-hidden className="h-5 w-5 text-prism-warning-ink" />
            ) : (
              <CircleSlash aria-hidden className="h-5 w-5 text-prism-ink-2" />
            )}
            {state === "on"
              ? "Sends are on"
              : state === "paused"
                ? "Sends are paused"
                : "Off in this environment (USDC_ENABLED is false)"}
          </p>
        </div>
        {data.enabled &&
          (data.paused ? (
            <Button onClick={() => setConfirm(false)}>Resume USDC sends</Button>
          ) : (
            <Button variant="destructive" onClick={() => setConfirm(true)}>
              Pause USDC sends
            </Button>
          ))}
      </div>
      <p className="text-prism-meta text-prism-ink-2">
        Screening:{" "}
        {screening.length > 0
          ? screening.join(", ")
          : data.screening.required
            ? "none configured, so every send is refused"
            : "none configured, sends are recorded as unscreened (staging)"}
        .
      </p>
      {relayerNotice(data)}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={open => !open && setConfirm(null)}
        title={confirm ? "Pause USDC sends?" : "Resume USDC sends?"}
        body={
          confirm
            ? "Every fan's USDC send stops on the next request and shows: USDC sends are paused for a moment. Your balance is safe. Try again shortly. Balances and receiving are not affected."
            : "Fans can send USDC again on the next request."
        }
        confirmLabel={confirm ? "Pause sends" : "Resume sends"}
        destructive={!!confirm}
        busy={setPaused.isPending}
        onConfirm={() => confirm !== null && setPaused.mutate({ paused: confirm })}
      />
    </section>
  );
}

function Tiles({ data }: { data: Overview }) {
  const relayer = data.relayer;
  const balance = relayer.configured && relayer.reachable ? relayer.balanceWei : null;
  const price = data.gas.ethUsd;
  return (
    <div className="grid gap-[13px] sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        label="Relayer gas"
        value={balance === null ? "Not available" : eth(balance, 4)}
        lines={[
          data.runwayDays === null
            ? "Runway: no spend in the last 7 days"
            : `Runway: about ${formatCount(data.runwayDays)} days at the last 7 days' spend`,
          `Alarm ${data.gasLines.alarmEth} ETH, stop ${data.gasLines.stopEth} ETH`,
        ]}
      />
      <Tile
        label="Sends today"
        value={formatCount(data.sendsToday.count)}
        lines={[
          `${usdc(data.sendsToday.units)} moved, ${formatCount(data.sendsToday.refused)} refused`,
          `Limit per account: ${data.limits.dailyCount} sends, ${usdc(data.limits.dailyUnits)} a day`,
        ]}
      />
      <Tile
        label="Gas this month"
        value={eth(data.gas.monthWei, 6)}
        lines={[
          [usd(data.gas.monthWei, price), `${formatCount(data.gas.monthSends)} sends`]
            .filter(Boolean)
            .join(", "),
          `Today ${eth(data.gas.todayWei, 6)}. Per send ${data.gas.perSendWei ? eth(data.gas.perSendWei, 8) : "None yet"}`,
        ]}
      />
      <Tile
        label="Gas share of volume"
        value={data.gas.shareOfVolumePct === null ? "None yet" : `${data.gas.shareOfVolumePct}%`}
        lines={[
          `${usdc(data.gas.volumeMonthUnits)} confirmed this month`,
          price === null
            ? "ETH price did not load"
            : `ETH at ${price.toLocaleString("en-US", { style: "currency", currency: "USD" })} (Coinbase spot)`,
        ]}
      />
    </div>
  );
}

function RecordTopUp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [txHash, setTxHash] = useState("");
  const [amountEth, setAmountEth] = useState("");
  const [note, setNote] = useState("");
  const record = useMutation({
    ...trpc.admin.money.recordFunding.mutationOptions(),
    onSuccess: result => {
      toast.success(
        `Top up of ${eth(result.amountWei)} recorded${result.verified ? "" : " (amount not verified on chain)"}`
      );
      setTxHash("");
      setAmountEth("");
      setNote("");
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: trpc.admin.money.pathKey() });
    },
  });
  return (
    <Dialog open={open} onOpenChange={next => !record.isPending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a relayer top up</DialogTitle>
          <DialogDescription>
            Paste the hash of the transaction that sent ETH to the relayer. The amount is read from
            the chain. For a multisig transfer the RPC may not show it; enter the amount then.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={event => {
            event.preventDefault();
            record.mutate({
              txHash: txHash.trim(),
              amountEth: amountEth.trim() || undefined,
              note: note.trim() || undefined,
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="topup-hash">Transaction hash</Label>
            <Input
              id="topup-hash"
              value={txHash}
              onChange={event => setTxHash(event.target.value)}
              placeholder="0x…"
              autoComplete="off"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="topup-amount">Amount in ETH (only if the chain cannot show it)</Label>
            <Input
              id="topup-amount"
              value={amountEth}
              onChange={event => setAmountEth(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="topup-note">Note</Label>
            <Input
              id="topup-note"
              value={note}
              onChange={event => setNote(event.target.value)}
              maxLength={255}
              placeholder="Treasury multisig, October top up"
            />
          </div>
          {record.error && <FieldError>{record.error.message}</FieldError>}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={record.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={record.isPending || !txHash.trim()}>
              {record.isPending ? "Checking the chain" : "Record top up"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Funding({ data }: { data: Overview }) {
  const [open, setOpen] = useState(false);
  const events = useQuery(trpc.admin.money.fundingEvents.queryOptions({ limit: 25 }));
  const relayer = data.relayer;
  const address = relayer.configured && relayer.reachable ? relayer.address : null;
  return (
    <section aria-labelledby="funding-title" className="space-y-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Eyebrow id="funding-title">Relayer funding</Eyebrow>
        <Button variant="secondary" onClick={() => setOpen(true)} disabled={!relayer.configured}>
          <Plus aria-hidden />
          Record top up
        </Button>
      </div>
      {address && (
        <p className="flex flex-wrap items-center gap-2 text-prism-meta text-prism-ink-2">
          Relayer on {data.network}
          <span className="break-all font-prism-mono text-prism-code-sm font-semibold text-prism-ink">
            {address}
          </span>
          <CopyButton value={address} label="Copy relayer address" size="inline" />
          {data.explorerUrl && (
            <a
              href={`${data.explorerUrl}/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="prism-focus inline-flex h-touch items-center gap-1 rounded-prism-8 px-2 font-semibold text-prism-nav"
            >
              Explorer
              <ExternalLink aria-hidden className="h-4 w-4" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
        </p>
      )}
      <p className="text-prism-meta text-prism-ink-2">
        Send ETH on {data.network} only, from the treasury multisig, then record the transaction
        here. There is no automatic top up in the pilot.
      </p>
      <SlabTable label="Relayer top ups">
        <thead>
          <tr>
            <th scope="col" className={thClass}>
              Date
            </th>
            <th scope="col" className={thClass}>
              Amount
            </th>
            <th scope="col" className={thClass}>
              From
            </th>
            <th scope="col" className={thClass}>
              Transaction
            </th>
            <th scope="col" className={thClass}>
              Note
            </th>
          </tr>
        </thead>
        {events.isPending ? (
          <SlabSkeletonRows columns={5} rows={3} />
        ) : events.isError ? (
          <SlabMessageRow columns={5}>
            <ErrorCard
              title="Top ups did not load"
              cause="Try again in a moment."
              retryLabel="Retry"
              onRetry={() => void events.refetch()}
              className="!shadow-none"
            />
          </SlabMessageRow>
        ) : events.data.length === 0 ? (
          <SlabMessageRow columns={5}>
            <p className="p-4 text-prism-label text-prism-ink-2">No top ups recorded yet.</p>
          </SlabMessageRow>
        ) : (
          <tbody>
            {events.data.map(event => (
              <tr key={event.id} className={rowClass}>
                <td className={tdClass}>{formatDayTime(event.createdAt)}</td>
                <td className={`${tdClass} tabular-nums`}>
                  <span className="inline-flex items-center gap-2">
                    {eth(event.amountWei)}
                    {!event.verified && <WordBadge tone="warning">Not verified</WordBadge>}
                  </span>
                </td>
                <td className={`${tdClass} font-prism-mono`}>{shortHex(event.fromAddress)}</td>
                <td className={tdClass}>
                  {data.explorerUrl ? (
                    <a
                      className="font-prism-mono text-prism-nav underline-offset-2 hover:underline"
                      href={`${data.explorerUrl}/tx/${event.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {shortHex(event.txHash)}
                    </a>
                  ) : (
                    shortHex(event.txHash)
                  )}
                </td>
                <td className={`${tdClass} text-prism-ink-2`}>{event.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        )}
      </SlabTable>
      <RecordTopUp open={open} onOpenChange={setOpen} />
    </section>
  );
}

function Sends({ explorerUrl }: { explorerUrl: string | null }) {
  const [filter, setFilter] = useState<SendFilter>("all");
  const sends = useQuery(
    trpc.admin.money.sends.queryOptions({
      limit: 25,
      status: filter === "all" ? undefined : filter,
    })
  );
  return (
    <section aria-labelledby="sends-title" className="space-y-[13px]">
      <Eyebrow id="sends-title">Recent USDC sends</Eyebrow>
      <FilterChips
        label="Status"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "confirmed", label: "Confirmed" },
          { value: "failed", label: "Failed" },
          { value: "refused", label: "Refused" },
        ]}
      />
      <SlabTable label="Recent USDC sends">
        <thead>
          <tr>
            <th scope="col" className={thClass}>
              Date
            </th>
            <th scope="col" className={thClass}>
              From
            </th>
            <th scope="col" className={thClass}>
              To
            </th>
            <th scope="col" className={thClass}>
              Amount
            </th>
            <th scope="col" className={thClass}>
              Status
            </th>
            <th scope="col" className={thClass}>
              Gas
            </th>
            <th scope="col" className={thClass}>
              Transaction
            </th>
          </tr>
        </thead>
        {sends.isPending ? (
          <SlabSkeletonRows columns={7} />
        ) : sends.isError ? (
          <SlabMessageRow columns={7}>
            <ErrorCard
              title="Sends did not load"
              cause="Try again in a moment."
              retryLabel="Retry"
              onRetry={() => void sends.refetch()}
              className="!shadow-none"
            />
          </SlabMessageRow>
        ) : sends.data.length === 0 ? (
          <SlabMessageRow columns={7}>
            <p className="p-4 text-prism-label text-prism-ink-2">No USDC sends yet.</p>
          </SlabMessageRow>
        ) : (
          <tbody>
            {sends.data.map(send => (
              <tr key={send.id} className={rowClass}>
                <td className={tdClass}>{formatDayTime(send.createdAt)}</td>
                <td className={tdClass}>{send.fromHandle ? `@${send.fromHandle}` : "No handle"}</td>
                <td className={tdClass}>
                  {send.toHandle ? (
                    `@${send.toHandle}`
                  ) : (
                    <span className="font-prism-mono">{shortHex(send.toAddress)}</span>
                  )}
                </td>
                <td className={`${tdClass} tabular-nums`}>{usdc(send.amount)}</td>
                <td className={tdClass}>
                  <span className="inline-flex flex-wrap items-center gap-1">
                    <WordBadge tone={STATUS_TONE[send.status] ?? "neutral"}>
                      {send.status}
                    </WordBadge>
                    {send.failureCode && (
                      <span className="text-prism-meta text-prism-ink-2">{send.failureCode}</span>
                    )}
                    {send.unscreened && <WordBadge tone="warning">Unscreened</WordBadge>}
                  </span>
                </td>
                <td className={`${tdClass} tabular-nums`}>
                  {send.gasCostWei ? eth(send.gasCostWei, 8) : ""}
                </td>
                <td className={tdClass}>
                  {send.txHash && explorerUrl ? (
                    <a
                      className="font-prism-mono text-prism-nav underline-offset-2 hover:underline"
                      href={`${explorerUrl}/tx/${send.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {shortHex(send.txHash)}
                    </a>
                  ) : (
                    ""
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

function Denies() {
  const denies = useQuery(trpc.admin.money.screeningDenies.queryOptions({ limit: 25 }));
  return (
    <section aria-labelledby="denies-title" className="space-y-[13px]">
      <Eyebrow id="denies-title">Screening denies</Eyebrow>
      <SlabTable label="Screening denies">
        <thead>
          <tr>
            <th scope="col" className={thClass}>
              Date
            </th>
            <th scope="col" className={thClass}>
              Account
            </th>
            <th scope="col" className={thClass}>
              Address
            </th>
            <th scope="col" className={thClass}>
              Checked
            </th>
            <th scope="col" className={thClass}>
              Vendor
            </th>
            <th scope="col" className={thClass}>
              Reference
            </th>
          </tr>
        </thead>
        {denies.isPending ? (
          <SlabSkeletonRows columns={6} rows={3} />
        ) : denies.isError ? (
          <SlabMessageRow columns={6}>
            <ErrorCard
              title="Denies did not load"
              cause="Try again in a moment."
              retryLabel="Retry"
              onRetry={() => void denies.refetch()}
              className="!shadow-none"
            />
          </SlabMessageRow>
        ) : denies.data.length === 0 ? (
          <SlabMessageRow columns={6}>
            <p className="p-4 text-prism-label text-prism-ink-2">No screening denies.</p>
          </SlabMessageRow>
        ) : (
          <tbody>
            {denies.data.map(deny => (
              <tr key={deny.id} className={rowClass}>
                <td className={tdClass}>{formatDayTime(deny.createdAt)}</td>
                <td className={tdClass}>{deny.handle ? `@${deny.handle}` : "None"}</td>
                <td className={`${tdClass} font-prism-mono`}>
                  <span className="inline-flex items-center gap-1">
                    {shortHex(deny.address)}
                    <CopyButton value={deny.address} label="Copy address" size="inline" />
                  </span>
                </td>
                <td className={tdClass}>
                  {deny.context === "own_address" ? "Own wallet" : "Send destination"}
                </td>
                <td className={tdClass}>{deny.vendor}</td>
                <td className={`${tdClass} break-all font-prism-mono text-prism-meta`}>
                  {deny.reference ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        )}
      </SlabTable>
    </section>
  );
}

// Buy USDC through Coinbase (Build Board #5 USDC-6, spec 3.8): sessions by
// status for the last 7 days with failure codes, the webhook log, and the
// Pause Buy USDC switch. Coinbase sells; nothing here moves money.

function OnrampStatusCard({ data }: { data: OnrampOverview }) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<null | boolean>(null);
  const setPaused = useMutation({
    ...trpc.admin.money.setOnrampPaused.mutationOptions(),
    onSuccess: (_result, input) => {
      setConfirm(null);
      toast.success(input.paused ? "Buy USDC paused" : "Buy USDC resumed");
      void queryClient.invalidateQueries({
        queryKey: trpc.admin.money.onrampOverview.queryKey(),
      });
    },
    onError: (_error, input) => {
      setConfirm(null);
      retryToast(input.paused ? "Buy USDC did not pause" : "Buy USDC did not resume", () =>
        setPaused.mutate(input)
      );
    },
  });

  const state = !data.configured ? "off" : data.paused ? "paused" : "on";
  return (
    <section
      aria-labelledby="onramp-status-title"
      className="prism-glass-clear flex flex-col gap-[13px] !rounded-prism-21 p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 id="onramp-status-title" className="text-prism-panel-title text-prism-ink">
            Buy USDC through Coinbase
          </h2>
          <p className="flex items-center gap-2 text-prism-label font-semibold text-prism-ink">
            {state === "on" ? (
              <CheckCircle2 aria-hidden className="h-5 w-5 text-prism-success" />
            ) : state === "paused" ? (
              <PauseCircle aria-hidden className="h-5 w-5 text-prism-warning-ink" />
            ) : (
              <CircleSlash aria-hidden className="h-5 w-5 text-prism-ink-2" />
            )}
            {state === "on"
              ? "Buy USDC is on"
              : state === "paused"
                ? "Buy USDC is paused"
                : "Off in this environment (ONRAMP_ENABLED or the CDP key is missing)"}
            {data.sandbox && <WordBadge tone="warning">Coinbase sandbox</WordBadge>}
          </p>
        </div>
        {data.configured &&
          (data.paused ? (
            <Button onClick={() => setConfirm(false)}>Resume Buy USDC</Button>
          ) : (
            <Button variant="destructive" onClick={() => setConfirm(true)}>
              Pause Buy USDC
            </Button>
          ))}
      </div>
      <p className="text-prism-meta text-prism-ink-2">
        Webhook:{" "}
        {!data.webhookConfigured
          ? "no secret set, so Coinbase deliveries are refused and purchases rely on status checks"
          : data.webhook.lastEventAt
            ? `last delivery ${formatDayTime(data.webhook.lastEventAt)}, ${formatCount(data.webhook.errorsThisWeek)} not matched or failed this week`
            : "no deliveries yet"}
        .
        {data.sandbox &&
          " Sandbox orders deliver nothing on chain, so Arrived on staging follows the webhook alone."}
      </p>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={open => !open && setConfirm(null)}
        title={confirm ? "Pause Buy USDC?" : "Resume Buy USDC?"}
        body={
          confirm
            ? "No new Coinbase price, link or order is made from the next request. Fans see: Buy USDC is paused for a moment. Try again shortly. Purchases already open keep reporting, and USDC Coinbase sends still arrives."
            : "Fans can buy USDC through Coinbase again on the next request."
        }
        confirmLabel={confirm ? "Pause Buy USDC" : "Resume Buy USDC"}
        destructive={!!confirm}
        busy={setPaused.isPending}
        onConfirm={() => confirm !== null && setPaused.mutate({ paused: confirm })}
      />
    </section>
  );
}

function OnrampTiles({ data }: { data: OnrampOverview }) {
  const week = data.week;
  const open =
    week.byStatus.created +
    week.byStatus.pending_verification +
    week.byStatus.pending_payment +
    week.byStatus.processing;
  return (
    <div className="grid gap-[13px] sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        label="Purchases, last 7 days"
        value={formatCount(week.total)}
        lines={[
          `${formatCount(week.byStatus.success)} done, ${formatCount(open)} open`,
          `${formatCount(week.byStatus.failed)} failed, ${formatCount(week.byStatus.expired + week.byStatus.canceled)} expired or canceled`,
        ]}
      />
      <Tile
        label="Bought, last 7 days"
        value={usdc(week.usdcUnits)}
        lines={[`Fans paid Coinbase ${week.paidUsd} USD`, "Amped.Bio charged nothing"]}
      />
      <Tile
        label="Ways to pay"
        value={formatCount(week.byMode.apple_pay + week.byMode.google_pay)}
        lines={[
          `Apple Pay ${formatCount(week.byMode.apple_pay)}, Google Pay ${formatCount(week.byMode.google_pay)}`,
          `Coinbase account ${formatCount(week.byMode.coinbase_account)}`,
        ]}
      />
      <Tile
        label="Failure codes"
        value={week.failures.length === 0 ? "None" : formatCount(week.byStatus.failed)}
        lines={
          week.failures.length === 0
            ? ["No failed purchases this week"]
            : week.failures.slice(0, 3).map(row => `${row.code}: ${formatCount(row.count)}`)
        }
      />
    </div>
  );
}

function OnrampSessions({ explorerUrl }: { explorerUrl: string | null }) {
  const [filter, setFilter] = useState<OnrampFilter>("all");
  const sessions = useQuery(
    trpc.admin.money.onrampSessions.queryOptions({
      limit: 25,
      status: filter === "all" ? undefined : filter,
    })
  );
  return (
    <section aria-labelledby="onramp-sessions-title" className="space-y-[13px]">
      <Eyebrow id="onramp-sessions-title">Recent Buy USDC purchases</Eyebrow>
      <FilterChips
        label="Status"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "success", label: "Done" },
          { value: "processing", label: "Sending" },
          { value: "failed", label: "Failed" },
          { value: "expired", label: "Expired" },
        ]}
      />
      <SlabTable label="Recent Buy USDC purchases">
        <thead>
          <tr>
            <th scope="col" className={thClass}>
              Date
            </th>
            <th scope="col" className={thClass}>
              Account
            </th>
            <th scope="col" className={thClass}>
              Way to pay
            </th>
            <th scope="col" className={thClass}>
              Paid Coinbase
            </th>
            <th scope="col" className={thClass}>
              USDC
            </th>
            <th scope="col" className={thClass}>
              Status
            </th>
            <th scope="col" className={thClass}>
              Transaction
            </th>
          </tr>
        </thead>
        {sessions.isPending ? (
          <SlabSkeletonRows columns={7} />
        ) : sessions.isError ? (
          <SlabMessageRow columns={7}>
            <ErrorCard
              title="Purchases did not load"
              cause="Try again in a moment."
              retryLabel="Retry"
              onRetry={() => void sessions.refetch()}
              className="!shadow-none"
            />
          </SlabMessageRow>
        ) : sessions.data.length === 0 ? (
          <SlabMessageRow columns={7}>
            <p className="p-4 text-prism-label text-prism-ink-2">No Buy USDC purchases yet.</p>
          </SlabMessageRow>
        ) : (
          <tbody>
            {sessions.data.map(session => (
              <tr key={session.id} className={rowClass}>
                <td className={tdClass}>{formatDayTime(session.createdAt)}</td>
                <td className={tdClass}>{session.handle ? `@${session.handle}` : "No handle"}</td>
                <td className={tdClass}>{ONRAMP_MODE_LABEL[session.mode] ?? session.mode}</td>
                <td className={`${tdClass} tabular-nums`}>
                  {session.fiatAmount ? `${session.fiatAmount} ${session.fiatCurrency}` : ""}
                </td>
                <td className={`${tdClass} tabular-nums`}>
                  {session.usdcUnits ? usdc(session.usdcUnits) : ""}
                </td>
                <td className={tdClass}>
                  <span className="inline-flex flex-wrap items-center gap-1">
                    <WordBadge tone={ONRAMP_TONE[session.status] ?? "neutral"}>
                      {ONRAMP_STATUS_LABEL[session.status] ?? session.status}
                    </WordBadge>
                    {session.failureCode && (
                      <span className="text-prism-meta text-prism-ink-2">
                        {session.failureCode}
                      </span>
                    )}
                    {session.sandbox && <WordBadge tone="warning">Sandbox</WordBadge>}
                  </span>
                </td>
                <td className={tdClass}>
                  {session.txHash && explorerUrl && !session.sandbox ? (
                    <a
                      className="font-prism-mono text-prism-nav underline-offset-2 hover:underline"
                      href={`${explorerUrl}/tx/${session.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {shortHex(session.txHash)}
                    </a>
                  ) : session.orderRef ? (
                    <span className="font-prism-mono text-prism-meta text-prism-ink-2">
                      {shortHex(session.orderRef)}
                    </span>
                  ) : (
                    ""
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

function OnrampEvents() {
  const events = useQuery(trpc.admin.money.onrampEvents.queryOptions({ limit: 25 }));
  return (
    <section aria-labelledby="onramp-events-title" className="space-y-[13px]">
      <Eyebrow id="onramp-events-title">Coinbase webhook log</Eyebrow>
      <SlabTable label="Coinbase webhook log">
        <thead>
          <tr>
            <th scope="col" className={thClass}>
              Received
            </th>
            <th scope="col" className={thClass}>
              Event
            </th>
            <th scope="col" className={thClass}>
              Result
            </th>
            <th scope="col" className={thClass}>
              Event ID
            </th>
          </tr>
        </thead>
        {events.isPending ? (
          <SlabSkeletonRows columns={4} rows={3} />
        ) : events.isError ? (
          <SlabMessageRow columns={4}>
            <ErrorCard
              title="The webhook log did not load"
              cause="Try again in a moment."
              retryLabel="Retry"
              onRetry={() => void events.refetch()}
              className="!shadow-none"
            />
          </SlabMessageRow>
        ) : events.data.length === 0 ? (
          <SlabMessageRow columns={4}>
            <p className="p-4 text-prism-label text-prism-ink-2">No Coinbase deliveries yet.</p>
          </SlabMessageRow>
        ) : (
          <tbody>
            {events.data.map(event => (
              <tr key={event.id} className={rowClass}>
                <td className={tdClass}>{formatDayTime(event.receivedAt)}</td>
                <td className={`${tdClass} font-prism-mono text-prism-meta`}>{event.eventType}</td>
                <td className={tdClass}>
                  {event.error ? (
                    <WordBadge tone={event.error === "no_session" ? "warning" : "danger"}>
                      {event.error === "no_session"
                        ? "No matching purchase"
                        : event.error === "unrecognized"
                          ? "Not recognized"
                          : "Failed"}
                    </WordBadge>
                  ) : event.processed ? (
                    <WordBadge tone="success">Applied</WordBadge>
                  ) : (
                    <WordBadge tone="neutral">Queued</WordBadge>
                  )}
                </td>
                <td className={`${tdClass} break-all font-prism-mono text-prism-meta`}>
                  {event.eventId}
                </td>
              </tr>
            ))}
          </tbody>
        )}
      </SlabTable>
    </section>
  );
}

function BuyUsdc({ explorerUrl }: { explorerUrl: string | null }) {
  const overview = useQuery({
    ...trpc.admin.money.onrampOverview.queryOptions(),
    refetchInterval: 60_000,
  });
  if (overview.isPending) {
    return <Skeleton delayMs={400} className="h-[120px] w-full !rounded-prism-21" />;
  }
  if (overview.isError) {
    return (
      <ErrorCard
        title="Buy USDC did not load"
        cause="Try again in a moment."
        retryLabel="Retry"
        onRetry={() => void overview.refetch()}
      />
    );
  }
  return (
    <div className="space-y-[21px]">
      <OnrampStatusCard data={overview.data} />
      <OnrampTiles data={overview.data} />
      <OnrampSessions explorerUrl={explorerUrl} />
      <OnrampEvents />
    </div>
  );
}

export function AdminMoney() {
  const overview = useQuery({
    ...trpc.admin.money.overview.queryOptions(),
    refetchInterval: 60_000,
  });

  if (overview.isPending) {
    return (
      <div aria-busy className="space-y-[13px] font-prism">
        <Skeleton delayMs={400} className="h-[120px] w-full !rounded-prism-21" />
        <Skeleton delayMs={400} className="h-[144px] w-full !rounded-prism-21" />
      </div>
    );
  }
  if (overview.isError) {
    return (
      <ErrorCard
        title="USDC money did not load"
        cause="Try again in a moment."
        retryLabel="Retry"
        onRetry={() => void overview.refetch()}
      />
    );
  }

  return (
    <div className="space-y-[21px] font-prism">
      <StatusCard data={overview.data} />
      <Tiles data={overview.data} />
      <Funding data={overview.data} />
      <Sends explorerUrl={overview.data.explorerUrl} />
      <Denies />
      <BuyUsdc explorerUrl={overview.data.explorerUrl} />
    </div>
  );
}
