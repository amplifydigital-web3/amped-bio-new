import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAddress, type Address } from "viem";
import { AlertCircle, ChevronRight, Loader2, QrCode, Search, Wallet, X } from "lucide-react";
import { Button, EmptyState, ErrorCard, Skeleton, cn, trpc } from "@repo/ui";
import { useDelayed } from "@/hooks/useDelayed";
import { useResolveRevoName } from "@/hooks/rns/useResolveRevoName";
import { DOMAIN_SUFFIX } from "@/config/rns/constants";
import { formatTokenAmount } from "../../explore/pool-panel/format";
import { avatarUrl, sameAddress, shortAddress, timeAgo, type Recipient } from "./model";
import type { RecentRecipient } from "./useRecentRecipients";

const SHOW_RNS = import.meta.env.VITE_SHOW_RNS === "true";
const DEBOUNCE_MS = 300;

export function RecipientAvatar({
  recipient,
  className,
}: {
  recipient: Pick<Recipient, "name" | "handle" | "avatar">;
  className?: string;
}) {
  const url = avatarUrl(recipient.avatar);
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className={cn("h-[34px] w-[34px] shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  const initial = (recipient.name || recipient.handle || "").trim()[0];
  if (!initial) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-prism-value-panel-2",
          className
        )}
      >
        <Wallet className="h-[21px] w-[21px] text-prism-value-ink" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "prism-glass-clear flex h-[34px] w-[34px] shrink-0 items-center justify-center !rounded-full text-prism-label font-bold text-prism-nav-pressed",
        className
      )}
    >
      {initial.toUpperCase()}
    </span>
  );
}

type Row = {
  key: string;
  recipient: Recipient | null;
  title: string;
  line: string;
  // Shown under the row when it cannot be chosen
  blockedReason?: string;
};

function SkeletonRows() {
  return (
    <div
      aria-busy
      aria-label="Loading"
      className="prism-slab divide-y divide-prism-line !rounded-prism-21"
    >
      {[0, 1, 2].map(index => (
        <div key={index} className="flex h-commit items-center gap-3 px-4">
          <Skeleton className="h-[34px] w-[34px] rounded-full" />
          <span className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3 rounded-full" />
            <Skeleton className="h-3 w-1/2 rounded-full" />
          </span>
        </div>
      ))}
    </div>
  );
}

function SectionHead({ label, count }: { label: string; count?: string }) {
  return (
    <div className="mb-[13px] flex items-center justify-between gap-3">
      <p className="flex items-center gap-2 text-prism-eyebrow uppercase text-prism-ink-2">
        <span aria-hidden className="h-[3px] w-[13px] rounded-full bg-prism-value" />
        {label}
      </p>
      {count && <span className="text-prism-meta tabular-nums text-prism-ink-2">{count}</span>}
    </div>
  );
}

/**
 * Screen Review 062: the To field and the recipient list. Before typing it
 * lists recent recipients; typing searches people. Every row is one tap that
 * selects; nothing opens by itself, and the list is a keyboard listbox (I14).
 */
export function RecipientPicker({
  ownAddress,
  initialQuery,
  recent,
  hasCamera,
  onSelect,
  onScan,
  inputRef,
}: {
  ownAddress?: Address;
  initialQuery: string;
  recent: {
    data?: RecentRecipient[];
    isPending: boolean;
    isError: boolean;
    refetch: () => void;
    enabled: boolean;
  };
  hasCamera: boolean;
  onSelect: (recipient: Recipient, query: string) => void;
  onScan: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [blockedKey, setBlockedKey] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const term = debounced.trim();
  const isHex = term.toLowerCase().startsWith("0x");
  const validAddress = isHex && isAddress(term, { strict: false }) ? (term as Address) : null;
  const isRns = SHOW_RNS && !isHex && term.endsWith(DOMAIN_SUFFIX);
  const peopleTerm = !isHex && !isRns ? term.replace(/^@/, "") : "";

  const people = useQuery({
    ...trpc.wallet.searchUsers.queryOptions(peopleTerm.toLowerCase()),
    enabled: peopleTerm.length > 0,
    retry: 1,
  });
  const member = useQuery({
    ...trpc.wallet.getUserByAddress.queryOptions({ address: validAddress ?? "" }),
    enabled: !!validAddress && !sameAddress(validAddress, ownAddress),
  });
  const rns = useResolveRevoName(isRns ? term : "");
  const showSkeleton = useDelayed(people.isFetching && !people.data, 400);
  const showRecentSkeleton = useDelayed(recent.isPending, 400);

  // Rows for the current state
  let section: { label: string; count?: string } | null = null;
  let rows: Row[] = [];
  let body: React.ReactNode = null;
  let note: React.ReactNode = null;

  if (!term) {
    if (!recent.enabled || (recent.data && recent.data.length === 0)) {
      body = (
        <p className="text-prism-body text-prism-ink-2">
          Search by name or @handle, paste an address, or scan a QR code.
        </p>
      );
    } else if (recent.isError) {
      body = (
        <ErrorCard
          title="Recent recipients did not load"
          onRetry={recent.refetch}
          retryLabel="Retry"
        />
      );
    } else if (recent.isPending) {
      body = showRecentSkeleton ? <SkeletonRows /> : null;
    } else {
      section = {
        label: "Recent",
        count: `${recent.data!.length} ${recent.data!.length === 1 ? "person" : "people"}`,
      };
      rows = recent.data!.map(item => ({
        key: item.address,
        recipient: item,
        title: item.name || (item.handle ? `@${item.handle}` : shortAddress(item.address)),
        line: `Sent ${formatTokenAmount(item.lastAmount)} tREVO · ${timeAgo(item.lastSentAt)}`,
      }));
    }
  } else if (isHex) {
    if (!validAddress) {
      note = (
        <p
          role="alert"
          className="prism-slab flex items-start gap-2 !rounded-prism-13 px-3 py-2 text-prism-meta text-prism-danger"
        >
          <AlertCircle aria-hidden className="mt-px h-[21px] w-[21px] shrink-0" />
          Addresses start with 0x and have 42 characters.
        </p>
      );
    } else if (sameAddress(validAddress, ownAddress)) {
      note = (
        <p
          role="alert"
          className="prism-slab flex items-start gap-2 !rounded-prism-13 px-3 py-2 text-prism-meta text-prism-danger"
        >
          <AlertCircle aria-hidden className="mt-px h-[21px] w-[21px] shrink-0" />
          This is your wallet. Choose someone else.
        </p>
      );
    } else if (member.isPending) {
      body = <SkeletonRows />;
    } else {
      const found = member.data;
      section = { label: "Address", count: "1 match" };
      const recipient: Recipient = {
        address: validAddress,
        name: found?.name,
        handle: found?.handle,
        avatar: found?.image,
      };
      rows = [
        {
          key: validAddress,
          recipient,
          title: `Send to ${found ? found.name || `@${found.handle}` : shortAddress(validAddress)}`,
          line: found?.handle
            ? `@${found.handle} · ${shortAddress(validAddress)}`
            : shortAddress(validAddress),
        },
      ];
      if (found) {
        note = (
          <p className="text-prism-meta text-prism-ink-2">
            This address belongs to an Amped.Bio member. Tap the row to choose them.
          </p>
        );
      }
    }
  } else if (isRns) {
    section = { label: "Name" };
    if (rns.isLoading) {
      body = (
        <div className="prism-slab flex h-commit items-center gap-3 !rounded-prism-21 px-4">
          <Loader2
            aria-hidden
            className="h-[21px] w-[21px] text-prism-nav motion-safe:animate-spin"
          />
          <span className="text-prism-label font-semibold text-prism-ink">{term}</span>
        </div>
      );
    } else if (rns.error) {
      body = <p className="text-prism-meta text-prism-ink-2">Name lookup failed</p>;
    } else if (rns.address && rns.address !== "0x0000000000000000000000000000000000000000") {
      rows = [
        {
          key: rns.address,
          recipient: { address: rns.address, name: term },
          title: term,
          line: shortAddress(rns.address),
        },
      ];
    } else {
      body = <p className="text-prism-meta text-prism-ink-2">No wallet uses {term}</p>;
    }
  } else if (people.isError) {
    body = (
      <ErrorCard
        title="People did not load"
        onRetry={() => void people.refetch()}
        retryLabel="Retry"
      />
    );
  } else if (!people.data) {
    body = showSkeleton ? <SkeletonRows /> : null;
  } else if (people.data.length === 0) {
    body = (
      <EmptyState
        icon={Search}
        title={`No people match '${peopleTerm}'`}
        action={
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
          >
            Clear search
          </Button>
        }
      />
    );
  } else {
    section = {
      label: "People",
      count: `${people.data.length} ${people.data.length === 1 ? "person" : "people"}`,
    };
    rows = people.data.map(person => {
      const own = sameAddress(person.walletAddress, ownAddress);
      return {
        key: person.id,
        recipient: person.walletAddress
          ? {
              address: person.walletAddress,
              name: person.displayName,
              handle: person.username,
              avatar: person.avatar,
            }
          : null,
        title: person.displayName || `@${person.username}`,
        line: person.walletAddress
          ? `@${person.username} · ${shortAddress(person.walletAddress)}`
          : `@${person.username} · No wallet yet`,
        blockedReason: !person.walletAddress
          ? "They need a wallet before they can receive tREVO."
          : own
            ? "This is your wallet. Choose someone else."
            : undefined,
      };
    });
  }

  const options = () =>
    Array.from(listRef.current?.querySelectorAll<HTMLElement>("[role=option]") ?? []);

  const moveFocus = (from: HTMLElement | null, step: number) => {
    const list = options();
    if (list.length === 0) return;
    const index = from ? list.indexOf(from) : -1;
    const next = list[Math.min(list.length - 1, Math.max(0, index + step))];
    next?.focus();
  };

  return (
    <div className="space-y-[21px] font-prism">
      <div className="space-y-2">
        <label htmlFor={`${listId}-to`} className="block text-prism-label font-bold text-prism-ink">
          To
        </label>
        <div className="prism-well flex h-touch items-center gap-2 pl-3 transition-shadow duration-prism-hover focus-within:shadow-[inset_0_2px_4px_rgba(22,21,43,0.07),0_0_0_1.5px_#0B5A80,0_0_0_5.5px_rgba(39,170,225,0.32)]">
          <Search aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-ink-2" />
          <input
            id={`${listId}-to`}
            ref={inputRef}
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setBlockedKey(null);
            }}
            onKeyDown={event => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveFocus(null, 0);
              }
            }}
            placeholder={
              SHOW_RNS ? "Name, @handle, address or name.revo" : "Name, @handle or 0x address"
            }
            className="h-full min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink placeholder:text-prism-ink-3 focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="prism-icon-btn prism-focus shrink-0 !bg-transparent !shadow-none"
            >
              <X aria-hidden className="h-5 w-5" />
            </button>
          ) : (
            hasCamera && (
              <button
                type="button"
                aria-label="Scan a QR code"
                title="Scan QR code"
                onClick={onScan}
                className="prism-icon-btn prism-focus shrink-0 !bg-transparent !shadow-none"
              >
                <QrCode aria-hidden className="h-[21px] w-[21px] text-prism-ink-2" />
              </button>
            )
          )}
        </div>
      </div>

      <div>
        {section && <SectionHead {...section} />}
        <p aria-live="polite" className="sr-only">
          {section?.count ?? ""}
        </p>
        {rows.length > 0 && (
          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            aria-label={section?.label ?? "Recipients"}
            className="prism-slab divide-y divide-prism-line overflow-hidden !rounded-prism-21"
            onKeyDown={event => {
              const target = event.target as HTMLElement;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveFocus(target, 1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                const list = options();
                if (list.indexOf(target) === 0) inputRef.current?.focus();
                else moveFocus(target, -1);
              } else if (event.key === "Escape") {
                event.preventDefault();
                inputRef.current?.focus();
              }
            }}
          >
            {rows.map(row => {
              const blocked = !row.recipient || !!row.blockedReason;
              return (
                <li key={row.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    aria-disabled={blocked || undefined}
                    onClick={() => {
                      if (blocked || !row.recipient) setBlockedKey(row.key);
                      else onSelect(row.recipient, query);
                    }}
                    className="prism-focus flex min-h-commit w-full items-center gap-3 px-4 py-2 text-left focus-visible:relative"
                  >
                    <RecipientAvatar
                      recipient={row.recipient ?? { name: row.title, handle: null, avatar: null }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-prism-label font-semibold text-prism-ink">
                        {row.title}
                      </span>
                      <span className="block truncate text-prism-meta tabular-nums text-prism-ink-2">
                        {row.line}
                      </span>
                      {blockedKey === row.key && row.blockedReason && (
                        <span role="status" className="block text-prism-meta text-prism-ink-2">
                          {row.blockedReason}
                        </span>
                      )}
                    </span>
                    {!blocked && (
                      <ChevronRight
                        aria-hidden
                        className="h-[21px] w-[21px] shrink-0 text-prism-ink-2"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {body}
        {note && <div className="mt-[13px]">{note}</div>}
      </div>
    </div>
  );
}
