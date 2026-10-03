import { useMemo, useState } from "react";
import { AtSign, Info, Wallet } from "lucide-react";
import { Button, ChipGroup, EmptyState, ErrorCard } from "@repo/ui";
import { RNS_GRACE_PERIOD_SECONDS, rnsExpiryFromGraceEnd, rnsExpiryState } from "@repo/web3";
import { useWalletContext } from "@/contexts/WalletContext";
import { useDelayed } from "@/hooks/useDelayed";
import useGetAllRegisteredNames from "@/hooks/rns/useGetAllRegisteredNames";
import { useReverseLookup } from "@/hooks/rns/useReverseLookup";
import { useAuthbaseIdentityStatus } from "@/hooks/rns/useAuthbaseIdentityStatus";
import { RNS_FLAGS } from "@/config/rns/flags";
import { Eyebrow } from "../../explore/pool-panel/sections";
import { useRnsAvatars, useRnsChain } from "./hooks";
import { formatRnsDate } from "./format";
import { NameRow, RowBadge, RowsSkeleton, VerifiedChip } from "./shared";

type Sort = "expiry" | "name";
const DAY = 86_400;

/**
 * Screen Review 101 I10 to I13: My RNS names as G0 rows on the room, soonest
 * expiry first, with Primary, Verified, expiring and grace badges from the
 * registration expiry. Names past the grace end are not listed. Verified
 * marks every name of a verified wallet (verification is per wallet).
 */
export function MyRnsNames({
  onOpenName,
  onSearch,
}: {
  onOpenName: (label: string) => void;
  onSearch: () => void;
}) {
  const wallet = useWalletContext();
  const address = wallet.address as `0x${string}` | undefined;
  const chain = useRnsChain();
  const [sort, setSort] = useState<Sort>("expiry");
  const { revoNames, isFetching, error, refetch } = useGetAllRegisteredNames(address, !!address);
  const { name: primaryLabel } = useReverseLookup((address ?? "") as `0x${string}`);
  const identity = useAuthbaseIdentityStatus(RNS_FLAGS.identity ? address : null);
  // Verification is per wallet: every name this wallet owns carries the chip
  const verified = RNS_FLAGS.identity && !!identity.data?.verified;
  const showSkeleton = useDelayed(isFetching, 400);

  const now = Math.floor(Date.now() / 1000);
  const rows = useMemo(
    () =>
      (revoNames ?? [])
        .map(item => {
          const expiry = rnsExpiryFromGraceEnd(item.expiryDateWithGrace);
          return { label: item.labelName, expiry, state: rnsExpiryState(expiry, now) };
        })
        .filter(row => row.label && row.state !== "lapsed")
        .sort((a, b) => (sort === "name" ? a.label.localeCompare(b.label) : a.expiry - b.expiry)),
    [revoNames, sort, now]
  );
  const avatars = useRnsAvatars(useMemo(() => rows.map(row => row.label), [rows]));

  let body: React.ReactNode;
  if (!address) {
    body = (
      <EmptyState
        icon={Wallet}
        title="Connect a wallet to see your RNS names"
        action={
          <Button type="button" variant="secondary" onClick={() => void wallet.connect()}>
            Connect wallet
          </Button>
        }
      />
    );
  } else if (isFetching && !rows.length) {
    body = showSkeleton ? <RowsSkeleton /> : null;
  } else if (error && !rows.length) {
    body = (
      <ErrorCard
        title="Your RNS names did not load"
        cause="The name index did not respond."
        onRetry={() => void refetch()}
        retryLabel="Retry"
        className="!rounded-prism-21"
      />
    );
  } else if (!rows.length) {
    body = (
      <EmptyState
        icon={AtSign}
        title="No RNS names yet"
        description="Search above to find one that is free."
        action={
          <Button type="button" variant="secondary" onClick={onSearch}>
            Search RNS names
          </Button>
        }
      />
    );
  } else {
    body = (
      <ul className="divide-y divide-prism-line">
        {rows.map(row => {
          const badges = [
            verified ? <VerifiedChip key="verified" /> : null,
            row.label === primaryLabel ? <RowBadge key="primary">Primary</RowBadge> : null,
            row.state === "expiring" ? (
              <RowBadge key="expiring" tone="warning">
                Expires in {Math.max(1, Math.ceil((row.expiry - now) / DAY))}{" "}
                {Math.ceil((row.expiry - now) / DAY) === 1 ? "day" : "days"}
              </RowBadge>
            ) : null,
            row.state === "grace" ? (
              <RowBadge key="grace" tone="warning">
                In grace period until {formatRnsDate(row.expiry + RNS_GRACE_PERIOD_SECONDS)}
              </RowBadge>
            ) : null,
          ].filter(Boolean);
          return (
            <NameRow
              key={row.label}
              label={row.label}
              chainId={chain.id}
              avatar={avatars[row.label]}
              meta={`${row.state === "grace" ? "Expired" : "Expires"} ${formatRnsDate(row.expiry)}`}
              badges={badges.length ? badges : undefined}
              onOpen={() => onOpenName(row.label)}
            />
          );
        })}
      </ul>
    );
  }

  return (
    <section aria-labelledby="my-rns-title" className="space-y-3 font-prism">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div id="my-rns-title" className="flex items-center gap-2">
          <Eyebrow>
            My RNS names{" "}
            {address && rows.length > 0 && <span className="tabular-nums">{rows.length}</span>}
          </Eyebrow>
        </div>
        {rows.length > 1 && (
          <ChipGroup<Sort>
            label="Sort RNS names"
            value={sort}
            onChange={setSort}
            options={[
              { value: "expiry", label: "Expiry" },
              { value: "name", label: "Name" },
            ]}
          />
        )}
      </div>
      {address && rows.length > 0 && (
        <p className="prism-glass-clear !rounded-prism-13 flex items-start gap-3 p-3 text-prism-body text-prism-ink">
          <Info aria-hidden className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-nav" />
          New RNS names can take a few minutes to show here. Search finds any RNS name right away.
        </p>
      )}
      {body}
    </section>
  );
}
