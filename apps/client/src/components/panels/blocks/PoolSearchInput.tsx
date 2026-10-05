import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, Check, Copy, Search, X } from "lucide-react";
import { Button, Skeleton, cn, trpc, useAuth } from "@repo/ui";
import type { PoolSearchResult } from "@repo/constants";
import { toast } from "@/components/ui/toast";
import { useShellNavigation } from "@/components/shell/ShellNavigation";
import { useDebounce } from "@/hooks/useDebounce";
import { useDelayed } from "@/hooks/useDelayed";

// Screen Review 038. The Creator pool block's pool picker: an ARIA 1.2
// combobox inside the open block row. Focus offers the creator's own pool;
// other creators' pools are found by typing (D1). Results open in the row's
// flow, never over it. A chosen pool collapses into one selected row.

const MIN_CHARS = 2;
const RESULT_LIMIT = 8;
const DEBOUNCE_MS = 233;

interface PoolSearchInputProps {
  onPoolSelect: (pool: PoolSearchResult) => void;
  currentAddress?: string;
  currentLabel?: string;
  /** The app network (appChainId), never the wallet's chain (038 I06) */
  chainId: string;
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function sameAddress(a?: string | null, b?: string | null) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/** 34 r8 pool art, or the initial on a line fill (038 I03). */
function PoolArt({ pool }: { pool: Pick<PoolSearchResult, "name" | "imageUrl"> }) {
  const [broken, setBroken] = useState(false);
  if (pool.imageUrl && !broken) {
    return (
      <img
        src={pool.imageUrl}
        alt=""
        onError={() => setBroken(true)}
        className="h-[34px] w-[34px] shrink-0 rounded-prism-8 object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-prism-8 bg-prism-line text-prism-label font-bold text-prism-ink-2"
    >
      {(pool.name || "?").charAt(0).toUpperCase()}
    </span>
  );
}

/** Second line of a pool: own pools show the handle and fans, others name the owner (D1). */
function OwnerLine({ pool, own }: { pool: PoolSearchResult; own: boolean }) {
  if (own) {
    return (
      <span className="block truncate text-prism-meta tabular-nums text-prism-ink-2">
        {pool.creatorHandle ? `@${pool.creatorHandle} · ` : ""}
        {pool.fans} {pool.fans === 1 ? "fan" : "fans"}
      </span>
    );
  }
  return (
    <span className="block truncate text-prism-meta text-prism-ink-2">
      Pool by @{pool.creatorHandle ?? "unknown"}, not yours
    </span>
  );
}

function YourPoolChip() {
  return (
    <span className="shrink-0 rounded-prism-8 bg-prism-nav-tint px-2 py-0.5 text-prism-meta font-semibold text-prism-nav-pressed">
      Your pool
    </span>
  );
}

function Eyebrow({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <p id={id} className="px-3 py-2 text-prism-eyebrow uppercase text-prism-ink-2">
      {children}
    </p>
  );
}

async function copyAddress(address: string) {
  try {
    await navigator.clipboard.writeText(address);
    toast.add({ type: "success", title: "Address copied" });
  } catch {
    toast.add({ type: "error", title: "The address did not copy. Select it and copy it." });
  }
}

/* -------------------------------------------------------------------------- */
/* Selected pool (038 I04, I10)                                               */
/* -------------------------------------------------------------------------- */

function SelectedPool({
  address,
  label,
  chainId,
  myPool,
  onChange,
}: {
  address: string;
  label?: string;
  chainId: string;
  myPool: PoolSearchResult | null | undefined;
  onChange: () => void;
}) {
  // A full address resolves the saved pool exactly
  const lookup = useQuery({
    ...trpc.pools.blockEditor.search.queryOptions({
      chainId,
      search: address,
      limit: 1,
    }),
    staleTime: 60_000,
  });
  const pool = lookup.data?.[0];
  const notFound = lookup.isSuccess && !pool;
  const own = !!pool && sameAddress(pool.address, myPool?.address);
  const name = pool?.name ?? label ?? "Pool";

  return (
    <div className="space-y-2">
      <div className="flex min-h-commit items-center gap-3 border-b border-prism-line py-2">
        {notFound ? (
          <AlertTriangle
            aria-hidden
            className="h-[21px] w-[21px] shrink-0 text-prism-warning-ink"
          />
        ) : (
          <PoolArt pool={{ name, imageUrl: pool?.imageUrl }} />
        )}
        <div className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-prism-label font-semibold text-prism-ink">
              {notFound ? "Pool not found" : name}
            </span>
            {own && <YourPoolChip />}
          </span>
          {pool && !notFound ? (
            <OwnerLine pool={pool} own={own} />
          ) : (
            <span className="block text-prism-meta tabular-nums text-prism-ink-2">
              {shortAddress(address)}
            </span>
          )}
        </div>
        {pool && (
          <span className="hidden text-prism-meta tabular-nums text-prism-ink-2 sm:inline">
            {shortAddress(pool.address)}
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Copy pool address"
          onClick={() => void copyAddress(address)}
        >
          <Copy aria-hidden />
        </Button>
        <Button type="button" variant="ghost" onClick={onChange} className="-mr-2">
          Change
        </Button>
      </div>
      {pool && !own && !notFound && pool.creatorHandle && (
        <p className="text-prism-meta text-prism-ink-2">
          This block shows a pool run by @{pool.creatorHandle}. Visitors see @{pool.creatorHandle}{" "}
          as the pool owner.
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Combobox (038 I01 to I03, I05 to I09, I12)                                 */
/* -------------------------------------------------------------------------- */

export function PoolSearchInput({
  onPoolSelect,
  currentAddress,
  currentLabel,
  chainId,
}: PoolSearchInputProps) {
  const { authUser } = useAuth();
  const { go } = useShellNavigation();
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;
  const helpId = `${baseId}-help`;

  const [changing, setChanging] = useState(!currentAddress);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // -1: no active option until the first arrow key (ARIA 1.2 combobox)
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const term = query.trim();
  const debounced = useDebounce(term, DEBOUNCE_MS);
  const searching = debounced.length >= MIN_CHARS;

  const myPoolQuery = useQuery({
    ...trpc.pools.blockEditor.myPool.queryOptions({ chainId }),
    enabled: !!authUser && !!chainId,
    staleTime: 60_000,
  });
  const myPool = myPoolQuery.data;

  const results = useQuery({
    ...trpc.pools.blockEditor.search.queryOptions({
      chainId,
      search: searching ? debounced : "--",
      limit: RESULT_LIMIT,
    }),
    enabled: searching && !!chainId,
    retry: false,
  });
  // Typing ahead of the debounce counts as loading
  const pending = term.length >= MIN_CHARS && (debounced !== term || results.isFetching);
  const showSkeleton = useDelayed(pending, 400);

  // The options the listbox shows right now
  const options: PoolSearchResult[] =
    term.length === 0
      ? myPool
        ? [myPool]
        : []
      : searching && !pending && results.data
        ? results.data
        : [];

  useEffect(() => setActive(-1), [term, results.data]);

  useEffect(() => {
    if (!currentAddress) setChanging(true);
  }, [currentAddress]);

  // Outside click closes and keeps the text (038 I01)
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const select = (pool: PoolSearchResult) => {
    onPoolSelect(pool);
    setOpen(false);
    setQuery("");
    setChanging(false);
  };

  const startChange = () => {
    setChanging(true);
    setQuery(currentLabel ?? "");
    setOpen(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  // 038 mobile: keep the well 21 below the top bar so the keyboard does not hide results
  const keepInView = () => {
    if (window.innerWidth >= 768 || !inputRef.current) return;
    const top = inputRef.current.getBoundingClientRect().top;
    const target = 55 + 21;
    if (Math.abs(top - target) > 8) window.scrollBy({ top: top - target, behavior: "smooth" });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive(index => Math.min(index + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(index => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      if (open && options[active]) {
        event.preventDefault();
        select(options[active]);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      } else if (currentAddress) {
        setChanging(false);
        setQuery("");
      }
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  if (currentAddress && !changing) {
    return (
      <SelectedPool
        address={currentAddress}
        label={currentLabel}
        chainId={chainId}
        myPool={myPool}
        onChange={startChange}
      />
    );
  }

  const activeId = open && options[active] ? `${baseId}-opt-${active}` : undefined;

  const option = (pool: PoolSearchResult, index: number) => {
    const own = sameAddress(pool.address, myPool?.address);
    const selected = sameAddress(pool.address, currentAddress);
    return (
      <li
        key={pool.id}
        id={`${baseId}-opt-${index}`}
        role="option"
        aria-selected={selected}
        onMouseDown={event => event.preventDefault()}
        onClick={() => select(pool)}
        onMouseEnter={() => setActive(index)}
        className={cn(
          "flex min-h-commit cursor-pointer items-center gap-3 border-b border-prism-line px-3 py-2 last:border-b-0",
          index === active &&
            "bg-[linear-gradient(180deg,rgba(255,255,255,0.56)_0%,rgba(255,255,255,0.18)_100%)]"
        )}
      >
        <PoolArt pool={pool} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-prism-label font-semibold text-prism-ink">
              {pool.name}
            </span>
            {own && <YourPoolChip />}
          </span>
          <OwnerLine pool={pool} own={own} />
        </span>
        <span className="text-prism-meta tabular-nums text-prism-ink-2">
          {shortAddress(pool.address)}
        </span>
        {selected && <Check aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-nav" />}
      </li>
    );
  };

  const listContent = () => {
    if (term.length === 0) {
      return (
        <>
          {myPool && (
            <>
              <Eyebrow id={`${baseId}-group`}>Your pool</Eyebrow>
              <ul role="group" aria-labelledby={`${baseId}-group`}>
                {option(myPool, 0)}
              </ul>
            </>
          )}
          {!myPool && myPoolQuery.isSuccess && (
            <p className="px-3 pt-3 text-prism-meta text-prism-ink-2">
              You have no pool yet.{" "}
              <button
                type="button"
                onClick={() => go("my-pool")}
                className="prism-focus rounded font-semibold text-prism-nav underline-offset-4 hover:underline"
              >
                Create a pool
              </button>
            </p>
          )}
          <p className="px-3 py-3 text-prism-meta text-prism-ink-2">
            Type to find another creator&apos;s pool.
          </p>
        </>
      );
    }
    if (term.length < MIN_CHARS) {
      return (
        <p className="px-3 py-3 text-prism-meta text-prism-ink-2">Type at least 2 characters.</p>
      );
    }
    if (pending) {
      if (!showSkeleton) return <div className="h-commit" aria-hidden />;
      return (
        <div aria-busy aria-label="Searching pools">
          {[0, 1, 2].map(index => (
            <div
              key={index}
              className="flex h-commit items-center gap-3 border-b border-prism-line px-3 last:border-b-0"
            >
              <Skeleton className="h-[34px] w-[34px] rounded-prism-8" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/2 rounded-full" />
                <Skeleton className="h-3 w-1/3 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (results.isError) {
      return (
        <div role="alert" className="flex items-start gap-3 px-3 py-3">
          <AlertCircle
            aria-hidden
            className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-danger"
          />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-prism-label font-bold text-prism-ink">Pools did not load</p>
            <p className="text-prism-meta text-prism-ink-2">
              Check your connection, then select Retry.
            </p>
            <Button type="button" variant="secondary" onClick={() => void results.refetch()}>
              Retry
            </Button>
          </div>
        </div>
      );
    }
    if (options.length === 0) {
      return (
        <div className="space-y-1 px-3 py-3">
          <p className="text-prism-body text-prism-ink-2">
            No pools match. Try the creator name or the pool address.
          </p>
          <Button
            type="button"
            variant="ghost"
            className="-ml-3"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
          >
            Clear search
          </Button>
        </div>
      );
    }
    return null;
  };

  const listItems = term.length > 0 && options.length > 0;

  return (
    <div ref={rootRef} className="space-y-2">
      <label htmlFor={inputId} className="block text-prism-label font-semibold text-prism-ink">
        Pool
      </label>
      <div className="prism-well prism-focus flex h-touch items-center gap-2 pl-[13px] pr-0 focus-within:shadow-[0_0_0_1.5px_#0B5A80,0_0_0_5.5px_rgba(39,170,225,0.32)]">
        <Search aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-ink-2" />
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-describedby={!currentAddress ? helpId : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="Search by creator, description or address"
          value={query}
          onChange={event => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            keepInView();
          }}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink outline-none placeholder:text-prism-ink-3"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="prism-focus flex h-touch w-touch shrink-0 items-center justify-center rounded-prism-13 text-prism-ink-2 hover:text-prism-ink"
          >
            <X aria-hidden className="h-[21px] w-[21px]" />
          </button>
        )}
      </div>

      {/* In the row's flow under the well, never an overlay (038 I12) */}
      {open && (
        <div className="prism-glass-clear max-h-[377px] overflow-y-auto !rounded-prism-13 shadow-prism-e2">
          {listItems ? (
            <ul id={listId} role="listbox" aria-label="Pools">
              {options.map(option)}
            </ul>
          ) : (
            <div id={listId} role="listbox" aria-label="Pools">
              {listContent()}
            </div>
          )}
        </div>
      )}

      {!currentAddress && (
        <p id={helpId} className="text-prism-meta text-prism-ink-2">
          Choose a pool to show it on your page.
        </p>
      )}
      {currentAddress && (
        <Button
          type="button"
          variant="ghost"
          className="-ml-3"
          onClick={() => {
            setChanging(false);
            setQuery("");
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      )}
    </div>
  );
}
