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
import { NameCard, RegisterTile, RowBadge, RowsSkeleton, VerifiedChip } from "./shared";

type Sort = "expiry" | "name";
const DAY = 86_400;

/**
 * Screen Review 101 I10 to I13, redesigned: My RNS names as cards, soonest
 * expiry first. Each card carries a visible Manage button (the name page:
 * profile, identity, renewal, transfer) so opening a name is never hidden
 * behind a tap on the row. Expiring and grace names get a warning band and an
 * Extend or Renew action; unverified names offer Verify when identity is on.
 * Names past the grace end are not listed. Verified marks every name of a
 * verified wallet (verification is per wallet).
 */
export function MyRnsNames({
  onOpenName,
  onSearch,
}: {
  onOpenName: (label: string, options?: { flow?: "extend"; view?: "identity" }) => void;
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
      <ul className="grid gap-[21px] md:grid-cols-2">
        {rows.map(row => {
          const isPrimary = row.label === primaryLabel;
          const badges = [
            isPrimary ? <RowBadge key="primary">Primary</RowBadge> : null,
            verified ? <VerifiedChip key="verified" /> : null,
          ].filter(Boolean);
          const daysLeft = Math.max(1, Math.ceil((row.expiry - now) / DAY));
          const band =
            row.state === "expiring"
              ? {
                  tone: "warning" as const,
                  text: `Expires in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`,
                }
              : row.state === "grace"
                ? {
                    tone: "urgent" as const,
                    text: `Expired. Renew by ${formatRnsDate(row.expiry + RNS_GRACE_PERIOD_SECONDS)} or it is released.`,
                  }
                : null;
          const secondary =
            row.state === "grace"
              ? {
                  label: "Renew now",
                  commit: true,
                  onClick: () => onOpenName(row.label, { flow: "extend" }),
                }
              : row.state === "expiring"
                ? { label: "Extend", onClick: () => onOpenName(row.label, { flow: "extend" }) }
                : RNS_FLAGS.identity && !verified && identity.isSuccess
                  ? { label: "Verify", onClick: () => onOpenName(row.label, { view: "identity" }) }
                  : null;
          return (
            <NameCard
              key={row.label}
              label={row.label}
              chainId={chain.id}
              avatar={avatars[row.label]}
              meta={`${row.state === "grace" ? "Expired" : "Expires"} ${formatRnsDate(row.expiry)}`}
              badges={badges.length ? badges : undefined}
              band={band}
              onManage={() => onOpenName(row.label)}
              secondary={secondary}
            />
          );
        })}
        <RegisterTile onClick={onSearch} />
      </ul>
    );
  }

  return (
    <section aria-labelledby="my-rns-title" className="space-y-3 font-prism">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div id="my-rns-title" className="flex items-center gap-2">
          <Eyebrow>
            Your RNS names{" "}
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
        <p className="text-prism-body text-prism-ink-2">
          Select <span className="font-bold text-prism-ink">Manage</span> on a name to edit its
          profile, verify your identity, extend it or transfer it.
        </p>
      )}
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
