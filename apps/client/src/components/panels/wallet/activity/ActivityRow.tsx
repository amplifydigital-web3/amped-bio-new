import { useId, useState } from "react";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Clock,
  Coins,
  Copy,
  ExternalLink,
  FileCode,
  Layers,
  Lock,
  Unlock,
  type LucideIcon,
} from "lucide-react";
import { Button, cn } from "@repo/ui";
import { toast } from "@/components/ui/toast";
import type { AddressProfile, AddressProfilesMap } from "../hooks/useAddressProfiles";
import {
  absoluteTime,
  formatAmount,
  relativeTime,
  shortAddress,
  type ActivityItem,
  type ActivityKind,
} from "./activityModel";

// Screen Review 057 I02 to I09, 058 I02 to I04. One 55 G0 row per hash: a 34
// direction disc, a person first sentence, time and status, and the signed
// amount. Opening it shows the detail slab in place.

const ICONS: Record<ActivityKind, LucideIcon> = {
  received: ArrowDownLeft,
  sent: ArrowUpRight,
  staked: Lock,
  unstaked: Unlock,
  claimed: Coins,
  createdPool: Layers,
  contractCall: FileCode,
};

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.add({ type: "success", title: `${what} copied` });
  } catch {
    toast.add({
      type: "error",
      title: `The ${what.toLowerCase()} did not copy. Select it and copy it.`,
    });
  }
}

function personName(address: string | null, profiles: AddressProfilesMap) {
  if (!address) return "";
  const profile = profiles[address.toLowerCase()];
  return profile?.handle ? `@${profile.handle}` : shortAddress(address);
}

function activityTitle(
  item: ActivityItem,
  profiles: AddressProfilesMap,
  poolNames: Record<string, string>
) {
  const pool = item.poolAddress
    ? (poolNames[item.poolAddress.toLowerCase()] ?? shortAddress(item.poolAddress))
    : "";
  const person = personName(item.counterparty, profiles);
  // A transfer into a pool names the pool (058 I02)
  const target =
    item.counterparty && poolNames[item.counterparty.toLowerCase()]
      ? poolNames[item.counterparty.toLowerCase()]
      : person;
  const token = item.token ? `${item.token.symbol} ` : "";
  switch (item.kind) {
    case "received":
      return `Received ${token}from ${target}`;
    case "sent":
      return `Sent ${token}to ${target}`;
    case "staked":
      return `Staked in ${pool}`;
    case "unstaked":
      return `Unstaked from ${pool}`;
    case "claimed":
      return `Claimed from ${pool}`;
    case "createdPool":
      return `Created pool ${item.poolNameHint ?? ""}`.trim();
    default:
      return "Contract call";
  }
}

function SignedAmount({ item }: { item: ActivityItem }) {
  if (item.amount === null || item.amount === 0n) return null;
  const failed = item.status === "failed";
  const sign = failed || !item.direction ? "" : item.direction === "in" ? "+" : "-";
  return (
    <span
      className={cn(
        "shrink-0 text-prism-label font-semibold tabular-nums",
        failed ? "text-prism-ink-2" : "text-prism-ink"
      )}
    >
      {sign}
      {formatAmount(item.amount, item.decimals)} {item.symbol}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Detail slab (057 I04, I07; 058 I03, I04)                                   */
/* -------------------------------------------------------------------------- */

function SlabRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-touch flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-prism-line px-4 py-2 last:border-b-0">
      <dt className="text-prism-meta text-prism-ink-2">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center justify-end gap-1 text-right text-prism-label font-semibold tabular-nums text-prism-ink">
        {children}
      </dd>
    </div>
  );
}

function PartyValue({
  address,
  profile,
  landingUrl,
}: {
  address: string;
  profile: AddressProfile | null | undefined;
  landingUrl: string;
}) {
  return (
    <>
      {profile?.image && (
        <img src={profile.image} alt="" className="h-[21px] w-[21px] rounded-full object-cover" />
      )}
      {profile?.name && <span className="truncate">{profile.name}</span>}
      {profile?.handle && (
        <a
          href={`${landingUrl}/${profile.handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="prism-focus rounded text-prism-meta font-semibold text-prism-nav underline-offset-4 hover:underline"
        >
          @{profile.handle}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
      <span className="text-prism-meta text-prism-ink-2">{shortAddress(address)}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Copy address ${shortAddress(address)}`}
        onClick={() => void copy(address, "Address")}
      >
        <Copy aria-hidden />
      </Button>
    </>
  );
}

function DetailSlab({
  item,
  profiles,
  explorerUrl,
  nativeSymbol,
  method,
}: {
  item: ActivityItem;
  profiles: AddressProfilesMap;
  explorerUrl: string | undefined;
  nativeSymbol: string;
  method: string | null;
}) {
  const landingUrl = import.meta.env.VITE_LANDINGPAGE_URL;
  const status =
    item.status === "failed"
      ? "Failed. Nothing moved."
      : item.status === "pending"
        ? "Pending"
        : "Done";
  return (
    <dl className="prism-well !rounded-prism-21 mx-0 mb-[13px] mt-1 overflow-hidden p-0">
      <SlabRow label="Transaction">
        {item.hash ? (
          <>
            <span>{shortAddress(item.hash)}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Copy transaction hash"
              onClick={() => void copy(item.hash ?? "", "Hash")}
            >
              <Copy aria-hidden />
            </Button>
            {explorerUrl && (
              <Button asChild variant="ghost" className="-mr-3">
                <a
                  href={`${explorerUrl}/tx/${item.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open in explorer
                  <ExternalLink aria-hidden />
                </a>
              </Button>
            )}
          </>
        ) : (
          // QA-052: internal transfers (pool reward payouts) carry no hash
          <span className="text-prism-ink-2">Internal transfer, no hash</span>
        )}
      </SlabRow>
      <SlabRow label="Date">{absoluteTime(item.time)}</SlabRow>
      <SlabRow label="From">
        <PartyValue
          address={item.from}
          profile={profiles[item.from.toLowerCase()]}
          landingUrl={landingUrl}
        />
      </SlabRow>
      <SlabRow label="To">
        <PartyValue
          address={item.to}
          profile={profiles[item.to.toLowerCase()]}
          landingUrl={landingUrl}
        />
      </SlabRow>
      {item.amount !== null && item.amount > 0n && (
        <SlabRow label={item.kind === "createdPool" ? "Starting stake" : "Amount"}>
          {formatAmount(item.amount, item.decimals, 6)} {item.symbol}
        </SlabRow>
      )}
      {item.token && !item.token.native && (
        <SlabRow label="Token">
          {item.token.name} ({item.token.symbol})
        </SlabRow>
      )}
      {item.transferType && <SlabRow label="Type">{item.transferType}</SlabRow>}
      {item.fee !== null && item.fee > 0n && (
        <SlabRow label="Network fee">
          {formatAmount(item.fee, 18, 6)} {nativeSymbol}
        </SlabRow>
      )}
      <SlabRow label="Status">{status}</SlabRow>
      {item.kind === "contractCall" && (
        <SlabRow label="Method">
          <span className="break-all text-prism-meta font-normal text-prism-ink-2">
            {method ?? item.selector}
          </span>
        </SlabRow>
      )}
    </dl>
  );
}

/* -------------------------------------------------------------------------- */
/* Row                                                                         */
/* -------------------------------------------------------------------------- */

export function ActivityRow({
  item,
  open,
  onToggle,
  profiles,
  poolNames,
  explorerUrl,
  nativeSymbol,
  method,
}: {
  item: ActivityItem;
  open: boolean;
  onToggle: () => void;
  profiles: AddressProfilesMap;
  poolNames: Record<string, string>;
  explorerUrl: string | undefined;
  nativeSymbol: string;
  method: string | null;
}) {
  const regionId = useId();
  const [iconBroken, setIconBroken] = useState(false);
  const Icon = ICONS[item.kind];
  const tokenIcon = item.token?.iconURL && !iconBroken ? item.token.iconURL : null;

  return (
    <li className="border-b border-prism-line last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={onToggle}
        className="prism-focus flex min-h-commit w-full items-center gap-3 rounded-prism-13 py-2 text-left"
      >
        <span
          aria-hidden
          className="prism-glass-clear flex h-[34px] w-[34px] shrink-0 items-center justify-center !rounded-full"
        >
          {tokenIcon ? (
            <img
              src={tokenIcon}
              alt={item.token?.symbol ?? ""}
              onError={() => setIconBroken(true)}
              className="h-[21px] w-[21px]"
            />
          ) : (
            <Icon className="h-[21px] w-[21px] text-prism-ink-2" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 break-words text-prism-label font-semibold text-prism-ink sm:line-clamp-1">
            {activityTitle(item, profiles, poolNames)}
          </span>
          <span className="flex flex-wrap items-center gap-x-1 text-prism-meta text-prism-ink-2">
            <span className="whitespace-nowrap">{relativeTime(item.time)}</span>
            {item.status === "pending" && (
              <>
                <span aria-hidden>·</span>
                <Clock aria-hidden className="h-[21px] w-[21px]" />
                <span>Pending</span>
              </>
            )}
            {item.status === "failed" && (
              <>
                <span aria-hidden>·</span>
                <AlertCircle aria-hidden className="h-[21px] w-[21px] text-prism-danger" />
                <span>Failed. Nothing moved.</span>
              </>
            )}
          </span>
        </span>
        <SignedAmount item={item} />
        <ChevronDown
          aria-hidden
          className={cn(
            "hidden h-[21px] w-[21px] shrink-0 text-prism-ink-2 transition-transform duration-prism-control motion-reduce:transition-none sm:block",
            open && "rotate-180"
          )}
        />
      </button>
      <div id={regionId} hidden={!open}>
        {open && (
          <DetailSlab
            item={item}
            profiles={profiles}
            explorerUrl={explorerUrl}
            nativeSymbol={nativeSymbol}
            method={method}
          />
        )}
      </div>
    </li>
  );
}
