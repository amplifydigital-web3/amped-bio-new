import { useId, useRef, useState } from "react";
import { AlertCircle, Check, ChevronRight, Info, RefreshCw, Search } from "lucide-react";
import { Button, cn } from "@repo/ui";
import { getRnsSuffix, RNS_LABEL_FIX } from "@repo/web3";
import { useDebounce } from "@/hooks/useDebounce";
import { useDelayed } from "@/hooks/useDelayed";
import { Eyebrow } from "../../explore/pool-panel/sections";
import {
  readRnsSearch,
  useAddressSummary,
  useMinRegistration,
  useRnsAvailability,
  useRnsChain,
  useRnsNetwork,
  useRnsOwner,
} from "./hooks";
import { formatRnsAmount, formatTerm, shortAddress, termRules, termSeconds } from "./format";
import { RnsName, VerifiedChip } from "./shared";
import { RNS_FLAGS } from "@/config/rns/flags";

const HELPER =
  "6 to 32 characters. Letters, numbers and hyphens. You can also paste a wallet address.";

/** 101 I09: the wrong network notice replaces the result slot. */
export function WrongNetworkNotice({
  onSwitch,
  switching,
}: {
  onSwitch: () => void;
  switching: boolean;
}) {
  return (
    <div
      role="status"
      className="prism-glass-clear !rounded-prism-13 space-y-3 p-[21px] font-prism"
    >
      <div className="flex items-start gap-3">
        <Info aria-hidden className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-nav" />
        <div className="min-w-0 text-prism-body text-prism-ink">
          <p className="font-bold">Switch to Libertas Testnet to register RNS names.</p>
          <p className="text-prism-ink-2">
            Your wallet is on another network. RNS names live on Libertas Testnet, so search and
            register work only there.
          </p>
        </div>
      </div>
      <Button type="button" size="lg" onClick={onSwitch} disabled={switching}>
        Switch network
      </Button>
    </div>
  );
}

/**
 * Screen Review 101 I02 to I09, I16: Find an RNS name. One search card with
 * the suffix in the well, one result row with four explicit outcomes, the
 * price at the registrar minimum term and Register as the only primary.
 */
export function FindRnsName({
  onRegister,
  onOpenName,
  onOpenAddress,
  inputRef,
}: {
  onRegister: (label: string) => void;
  onOpenName: (label: string) => void;
  onOpenAddress: (address: string) => void;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  const ids = { input: useId(), helper: useId(), error: useId() };
  const chain = useRnsChain();
  const network = useRnsNetwork();
  const [value, setValue] = useState("");
  const debounced = useDebounce(value, 500);
  const search = readRnsSearch(debounced, chain.id);
  const settled = debounced === value;

  const min = useMinRegistration();
  const rules = min.data !== undefined ? termRules(min.data) : null;
  const term = rules ? { unit: rules.unit, count: rules.min } : null;
  const label = search.kind === "name" ? search.label : null;
  const availability = useRnsAvailability(label, term ? termSeconds(term) : undefined);
  const owner = useRnsOwner(availability.status === "registered" ? label : null);
  const ownerSummary = useAddressSummary(owner);
  const addressSummary = useAddressSummary(search.kind === "address" ? search.address : null);

  const checking =
    !settled ||
    (search.kind === "name" &&
      (availability.status === "checking" || min.isLoading || availability.isFetching));
  const showSkeleton = useDelayed(checking && value.trim() !== "", 400);
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;

  const open = () => {
    if (search.kind === "address") onOpenAddress(search.address);
    if (search.kind !== "name") return;
    if (availability.status === "available") onRegister(search.label);
    if (availability.status === "registered") onOpenName(search.label);
  };

  const invalid = settled && search.kind === "invalid" ? RNS_LABEL_FIX[search.problem] : null;
  const price =
    term && availability.priceWei !== undefined
      ? {
          term: formatTerm(term),
          amount: `${formatRnsAmount(availability.priceWei)} ${chain.nativeCurrency.symbol}`,
        }
      : null;

  // In-app every user is signed in and the embedded wallet connects
  // automatically, so the result never offers "Connect wallet". Availability
  // and price are public reads, and RegisterFlow handles the rare
  // wallet-not-ready edge before signing.
  const registerButton = (
    <Button
      type="button"
      size="lg"
      onClick={() => label && onRegister(label)}
      className="max-sm:w-full"
    >
      Register
    </Button>
  );

  let result: React.ReactNode = null;
  if (value.trim() && network.wrongNetwork) {
    result = (
      <WrongNetworkNotice onSwitch={network.switchToLibertas} switching={network.switching} />
    );
  } else if (showSkeleton && checking) {
    result = (
      <div aria-hidden className="flex items-center justify-between gap-3 py-2">
        <span className="h-4 w-48 rounded-full bg-prism-line motion-safe:animate-pulse" />
        <span className="h-commit w-[120px] rounded-prism-13 bg-prism-line motion-safe:animate-pulse" />
      </div>
    );
  } else if (!checking && search.kind === "address") {
    const summary = addressSummary.data;
    const person = summary?.person;
    const count = summary?.activeNames;
    const countText =
      count === null || count === undefined ? "" : `${count} RNS ${count === 1 ? "name" : "names"}`;
    result = (
      <div className="flex items-center gap-3 py-1">
        {person?.image ? (
          <img
            src={person.image}
            alt=""
            className="h-touch w-touch shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-full bg-prism-value-panel-1 text-prism-label font-bold text-prism-value-ink"
          >
            {(person?.name ?? "0x").slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-prism-label font-semibold text-prism-ink">
            <span className="break-all">
              {person ? person.name : shortAddress(search.address)}
              {countText && `, ${countText}`}
            </span>
            {RNS_FLAGS.identity && summary?.verified && <VerifiedChip />}
          </p>
          <p className="text-prism-meta tabular-nums text-prism-ink-2">
            {person && `${shortAddress(search.address)} · `}
            {summary?.primaryName
              ? `Primary RNS name ${summary.primaryName}`
              : addressSummary.isLoading
                ? "Checking"
                : "No primary name"}
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={() => onOpenAddress(search.address)}>
          Open
          <ChevronRight aria-hidden />
        </Button>
      </div>
    );
  } else if (!checking && search.kind === "name") {
    const name = (
      <p className="text-prism-label font-semibold text-prism-ink">
        <RnsName label={search.label} chainId={chain.id} />
      </p>
    );
    if (availability.status === "error" || min.isError) {
      result = (
        <div className="flex flex-wrap items-center gap-3 py-1">
          <div className="min-w-0 flex-1 space-y-1">
            {name}
            <p role="alert" className="flex items-start gap-1.5 text-prism-meta text-prism-danger">
              <AlertCircle aria-hidden className="h-[18px] w-[18px] shrink-0" />
              We could not check this RNS name. Check your connection and try again.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (min.isError) void min.refetch();
              void availability.refetch();
            }}
          >
            <RefreshCw aria-hidden />
            Retry
          </Button>
        </div>
      );
    } else if (availability.status === "registered") {
      const person = ownerSummary.data?.person;
      result = (
        <div className="flex items-center gap-3 py-1">
          <div className="min-w-0 flex-1 space-y-1">
            {name}
            <p className="text-prism-meta text-prism-ink-2">
              Registered
              {person ? ` · ${person.name}` : owner ? ` · ${shortAddress(owner)}` : ""}
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={() => onOpenName(search.label)}>
            View
          </Button>
        </div>
      );
    } else if (availability.status === "available") {
      result = (
        <div className="space-y-3 py-1">
          <div className="space-y-1">
            {name}
            <p className="flex items-center gap-1 text-prism-meta font-bold text-prism-success">
              <Check aria-hidden className="h-[18px] w-[18px]" />
              Available
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 max-sm:flex-col max-sm:items-stretch">
            {price ? (
              <p className="text-prism-label tabular-nums text-prism-ink">
                {price.term}, <b className="font-bold">{price.amount}</b>
              </p>
            ) : (
              <p className="text-prism-meta text-prism-ink-2">Checking the price…</p>
            )}
            {registerButton}
          </div>
        </div>
      );
    }
  }

  return (
    <section aria-labelledby="find-rns-title" className="space-y-3 font-prism">
      <div id="find-rns-title">
        <Eyebrow>Find an RNS name</Eyebrow>
      </div>
      <p className="text-prism-body text-prism-ink-2">
        Get a name that points to your wallet, like mayalin.revo. Anyone can send to it or find your
        page by it.
      </p>
      <div className="prism-glass-clear space-y-3 p-[13px] sm:p-[21px]">
        <div className="space-y-2">
          <label
            htmlFor={ids.input}
            className="block text-prism-label font-semibold text-prism-ink"
          >
            Search RNS names
          </label>
          <div
            className={cn(
              "prism-well flex h-touch items-center gap-2 px-3 focus-within:shadow-[inset_0_0_0_1.5px_#0B5A80,0_0_0_4px_rgba(39,170,225,0.32)]",
              invalid && "shadow-[inset_0_0_0_1.5px_#B3261E]"
            )}
          >
            <Search aria-hidden className="h-[21px] w-[21px] shrink-0 text-prism-ink-3" />
            <input
              ref={ref}
              id={ids.input}
              value={value}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={event => setValue(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  open();
                }
              }}
              aria-invalid={invalid ? true : undefined}
              aria-describedby={`${ids.helper}${invalid ? ` ${ids.error}` : ""}`}
              className="min-w-0 flex-1 bg-transparent text-prism-label text-prism-ink focus:outline-none"
            />
            {search.kind !== "address" && (
              <span className="shrink-0 text-prism-meta text-prism-ink-2">
                {getRnsSuffix(chain.id)}
              </span>
            )}
          </div>
          <p id={ids.helper} className="text-prism-meta text-prism-ink-2">
            {HELPER}
          </p>
          {invalid && (
            <p
              id={ids.error}
              role="alert"
              className="flex items-center gap-1.5 text-prism-meta text-prism-danger"
            >
              <AlertCircle aria-hidden className="h-[18px] w-[18px] shrink-0" />
              {invalid}
            </p>
          )}
        </div>
        {result && <div className="border-t border-prism-line pt-3">{result}</div>}
      </div>
    </section>
  );
}
