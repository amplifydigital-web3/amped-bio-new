import { useId, useMemo, useRef, useState } from "react";
import { getAddress, isAddress } from "viem";
import { AlertTriangle, ArrowLeft, AtSign, Copy, Info, Search, XCircle } from "lucide-react";
import { Button, EmptyState, ErrorCard } from "@repo/ui";
import { formatRnsName, parseRnsInput, rnsExpiryFromGraceEnd, rnsExpiryState } from "@repo/web3";
import { toast } from "@/components/ui/toast";
import { useDelayed } from "@/hooks/useDelayed";
import useGetAllRegisteredNames from "@/hooks/rns/useGetAllRegisteredNames";
import { RNS_COPY } from "@/config/rns/copy";
import { RNS_FLAGS } from "@/config/rns/flags";
import { Eyebrow } from "../../explore/pool-panel/sections";
import { useAddressSummary, useRnsAvatars, useRnsChain } from "./hooks";
import { formatRnsDate, shortAddress } from "./format";
import { NameRow, NameTile, RnsName, RowBadge, RowsSkeleton, VerifiedChip } from "./shared";

const SEARCH_FROM = 6; // 111 D1: search only at 6 or more names

function CopyIconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="prism-focus inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-full text-prism-ink-2"
    >
      <Copy aria-hidden className="h-[21px] w-[21px]" />
    </button>
  );
}

function BackToRns({ onBack }: { onBack: () => void }) {
  return (
    <Button type="button" variant="secondary" onClick={onBack}>
      <ArrowLeft aria-hidden />
      RNS
    </Button>
  );
}

/**
 * Screen Review 111 I01 to I07, I16: who owns this address and which RNS
 * names point to it. The owner line comes from rns.addressSummary (a bound
 * Amped.Bio page only), never from Authbase attributes.
 */
export function AddressView({
  address,
  onBack,
  onOpenName,
}: {
  address: string;
  onBack: () => void;
  onOpenName: (label: string) => void;
}) {
  const chain = useRnsChain();
  const valid = isAddress(address);
  const owner = valid ? getAddress(address) : null;
  const summary = useAddressSummary(owner);
  const { revoNames, isFetching, error, refetch } = useGetAllRegisteredNames(
    owner ? (owner.toLowerCase() as `0x${string}`) : undefined,
    !!owner,
    true
  );
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const showSkeleton = useDelayed(isFetching, 400);

  const primaryLabel = summary.data?.primaryName
    ? parseRnsInput(summary.data.primaryName, chain.id)
    : null;
  const now = Math.floor(Date.now() / 1000);
  const rows = useMemo(
    () =>
      (revoNames ?? [])
        .map(item => ({
          label: item.labelName,
          expiry: rnsExpiryFromGraceEnd(item.expiryDateWithGrace),
        }))
        .filter(row => {
          const state = rnsExpiryState(row.expiry, now);
          return row.label && (state === "active" || state === "expiring");
        })
        .sort((a, b) => {
          if (a.label === primaryLabel) return -1;
          if (b.label === primaryLabel) return 1;
          return a.expiry - b.expiry;
        }),
    [revoNames, primaryLabel, now]
  );
  const avatars = useRnsAvatars(useMemo(() => rows.map(row => row.label), [rows]));
  const visible = query ? rows.filter(row => row.label.includes(query.trim().toLowerCase())) : rows;

  if (!owner) {
    return (
      <div className="space-y-[21px] font-prism">
        <BackToRns onBack={onBack} />
        <div role="alert" className="prism-glass-clear flex items-start gap-3 p-[34px]">
          <XCircle aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-danger" />
          <div className="space-y-3">
            <h2 className="text-prism-panel-title text-prism-ink">This is not a wallet address</h2>
            {/* 079 I20: the entered value, so the person sees what failed */}
            <p className="break-all text-prism-meta tabular-nums text-prism-ink-2">{address}</p>
            <p className="text-prism-body text-prism-ink-2">Check the address and try again.</p>
            <Button type="button" variant="secondary" onClick={onBack}>
              Back to RNS
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const person = summary.data?.person ?? null;
  const verified = RNS_FLAGS.identity ? (summary.data?.verified ?? null) : null;
  const copy = (value: string) =>
    navigator.clipboard
      .writeText(value)
      .then(() => toast.add({ title: "Copied", type: "success" }))
      .catch(() => undefined);
  // 079 I21, I25: the header leads with the forward checked primary name
  const primaryFull = primaryLabel ? formatRnsName(primaryLabel, chain.id) : null;

  let list: React.ReactNode;
  if (isFetching && !rows.length) {
    list = showSkeleton ? <RowsSkeleton /> : null;
  } else if (error && !rows.length) {
    list = (
      <ErrorCard
        title="RNS names did not load"
        cause="The name index did not respond."
        onRetry={() => void refetch()}
        retryLabel="Retry"
        className="!rounded-prism-21"
      />
    );
  } else if (!rows.length) {
    list = (
      <EmptyState
        icon={AtSign}
        title="No active RNS names"
        description="This address does not own an active RNS name."
      />
    );
  } else if (!visible.length) {
    list = (
      <EmptyState
        icon={Search}
        title={`No RNS names match '${query.trim()}'`}
        description="Check the spelling of the name."
        action={
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
          >
            Clear search
          </Button>
        }
      />
    );
  } else {
    list = (
      <ul className="divide-y divide-prism-line">
        {visible.map(row => (
          <NameRow
            key={row.label}
            label={row.label}
            chainId={chain.id}
            avatar={avatars[row.label]}
            meta={`Active until ${formatRnsDate(row.expiry)}`}
            badges={row.label === primaryLabel ? <RowBadge>Primary</RowBadge> : undefined}
            onOpen={() => onOpenName(row.label)}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-[21px] font-prism">
      <BackToRns onBack={onBack} />

      <section className="prism-glass-clear flex flex-wrap items-start gap-3 p-[21px] sm:flex-nowrap">
        {person?.image ? (
          <img
            src={person.image}
            alt=""
            className="h-commit w-commit shrink-0 rounded-prism-13 object-cover"
          />
        ) : (
          <NameTile size={55} />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          {primaryLabel && primaryFull ? (
            <>
              <h1 className="flex min-w-0 items-center gap-1 text-[26px] font-bold leading-[33px] text-prism-ink">
                <RnsName label={primaryLabel} chainId={chain.id} className="min-w-0 break-all" />
                <CopyIconButton label="Copy name" onClick={() => copy(primaryFull)} />
              </h1>
              <p className="-mt-1 flex items-center gap-1 text-prism-meta tabular-nums text-prism-ink-2">
                {shortAddress(owner)}
                <CopyIconButton label="Copy address" onClick={() => copy(owner)} />
              </p>
            </>
          ) : (
            <>
              <h1 className="flex items-center gap-1 text-[26px] font-bold leading-[33px] tabular-nums text-prism-ink">
                <span className="truncate">{shortAddress(owner)}</span>
                <CopyIconButton label="Copy address" onClick={() => copy(owner)} />
              </h1>
              {!summary.isLoading && (
                <p className="text-prism-body text-prism-ink-2">No primary name</p>
              )}
            </>
          )}
          {person ? (
            <p className="flex flex-wrap items-center gap-2 text-prism-label text-prism-ink-2">
              Owned by <b className="font-semibold text-prism-ink">{person.name}</b>
              {verified && <VerifiedChip />}
            </p>
          ) : (
            rows.length > 0 && (
              <p className="text-prism-meta tabular-nums text-prism-ink-2">
                {rows.length} RNS {rows.length === 1 ? "name" : "names"}
              </p>
            )
          )}
          {verified && (
            <p className="flex items-start gap-1.5 text-prism-meta text-prism-ink-2">
              <Info aria-hidden className="h-4 w-4 shrink-0" />
              {RNS_COPY.verifiedDisclaimer}
            </p>
          )}
          {verified === false && (
            <p className="prism-notice !mt-3 flex items-start gap-2 text-prism-meta text-prism-ink">
              <AlertTriangle
                aria-hidden
                className="h-[18px] w-[18px] shrink-0 text-prism-warning-ink"
              />
              <span>
                <b className="font-bold text-prism-warning-ink">Not verified.</b> Check with the
                owner before you send.
              </span>
            </p>
          )}
        </div>
        {primaryLabel && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenName(primaryLabel)}
            className="max-sm:w-full"
          >
            View name
          </Button>
        )}
      </section>

      <section aria-labelledby="address-names-title" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div id="address-names-title">
            <Eyebrow>
              RNS names {rows.length > 0 && <span className="tabular-nums">{rows.length}</span>}
            </Eyebrow>
          </div>
          {rows.length > 1 && (
            <span className="text-prism-meta text-prism-ink-2">
              Primary first, then soonest expiry
            </span>
          )}
        </div>
        {rows.length >= SEARCH_FROM && (
          <div className="space-y-2">
            <label
              htmlFor={searchId}
              className="block text-prism-label font-semibold text-prism-ink"
            >
              Search RNS names
            </label>
            <div className="prism-well flex h-touch items-center gap-2 px-3 focus-within:shadow-[inset_0_0_0_1.5px_#0B5A80,0_0_0_4px_rgba(39,170,225,0.32)]">
              <Search aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-ink-3" />
              <input
                ref={searchRef}
                id={searchId}
                value={query}
                autoComplete="off"
                onChange={event => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink focus:outline-none"
              />
            </div>
          </div>
        )}
        {list}
      </section>
    </div>
  );
}
