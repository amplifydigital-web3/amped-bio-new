import { useId, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  ImageIcon,
  Info,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Button, cn } from "@repo/ui";
import { formatRnsName, getRnsSuffix, parseRnsInput } from "@repo/web3";
import { toast } from "@/components/ui/toast";
import { useEditor } from "@/contexts/EditorContext";
import { RNS_FLAGS } from "@/config/rns/flags";
import { Eyebrow } from "../../../explore/pool-panel/sections";
import { formatRnsDate, shortAddress } from "../format";
import { NameTile, RowBadge } from "../shared";
import { bannerStyle } from "./banner";
import { ExpiryBadge } from "./NameHeader";
import { isBound, readRnsLinks, type RnsNameState } from "./useRnsName";
import type { PendingBanner, PublishRow } from "./usePublishDiff";

const copyValue = (value: string) =>
  navigator.clipboard
    .writeText(value)
    .then(() => toast.add({ title: "Copied", type: "success" }))
    .catch(() => undefined);

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => void copyValue(value)}
      aria-label={label}
      className="prism-focus -my-2 inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-full text-prism-ink-2"
    >
      <Copy aria-hidden className="h-[18px] w-[18px]" />
    </button>
  );
}

function ExplorerLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button asChild variant="ghost">
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
        <ExternalLink aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </Button>
  );
}

const hostOf = (url: string) => {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
};
const hrefOf = (url: string) => (url.startsWith("http") ? url : `https://${url}`);

/** P07 (102 I11, I21): the published records, read only. Change banner for the owner. */
function RecordCard({
  name,
  chainId,
  banner,
  onChangeBanner,
}: {
  name: RnsNameState;
  chainId: number;
  banner: PendingBanner | null;
  onChangeBanner: () => void;
}) {
  const records = name.records;
  const bannerUrl = banner ? banner.url : (records.banner ?? null);
  const bannerMeta = banner ? banner.meta : records.bannerMeta;
  const links = readRnsLinks(records);
  const pageLink = records.url && !records.url.includes(",") ? records.url : null;
  const empty = !records.avatar && !records.bio && !pageLink && !links.length && !bannerUrl;

  return (
    <section aria-label="Published to your RNS name" className="prism-glass-clear overflow-hidden">
      <div
        className="relative h-[89px] bg-prism-value-panel-1"
        style={bannerStyle(bannerUrl, bannerMeta)}
      >
        {name.isOwner && (
          <div className="absolute bottom-2 right-2">
            <Button type="button" variant="secondary" onClick={onChangeBanner}>
              <ImageIcon aria-hidden />
              Change banner
            </Button>
          </div>
        )}
      </div>
      <div className="space-y-3 p-[21px] pt-0">
        <div className="relative -mt-[27px] w-fit rounded-prism-13 ring-4 ring-white/90">
          <NameTile src={records.avatar} size={55} />
        </div>
        {empty ? (
          <p className="text-prism-body text-prism-ink-2">
            Nothing published to {formatRnsName(name.label, chainId)} yet.
          </p>
        ) : (
          <>
            {records.bio && (
              <p className="whitespace-pre-line text-prism-body text-prism-ink">{records.bio}</p>
            )}
            {(pageLink || links.length > 0) && (
              <ul className="-ml-3 flex flex-wrap">
                {[pageLink, ...links].filter(Boolean).map(link => (
                  <li key={link}>
                    <ExplorerLink href={hrefOf(link as string)}>
                      {hostOf(link as string)}
                    </ExplorerLink>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/** P09 (102 I06, 111 I15): in sync, or the change count with Publish changes. */
function SyncLine({
  rows,
  fullName,
  onPublish,
}: {
  rows: PublishRow[];
  fullName: string;
  onPublish: () => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-prism-meta text-prism-ink-2">
        <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0 text-prism-success" />
        In sync with your Amped.Bio profile
      </p>
    );
  }
  return (
    <div className="prism-glass-clear !rounded-prism-13 flex flex-wrap items-start gap-3 p-[13px]">
      <Info aria-hidden className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-nav" />
      <div className="min-w-0 flex-1">
        <p className="text-prism-label font-semibold text-prism-ink">
          {rows.length} {rows.length === 1 ? "change" : "changes"} not on {fullName} yet
        </p>
        <p className="text-prism-meta text-prism-ink-2">
          Your Amped.Bio profile changed. Publish to update {fullName}.
        </p>
      </div>
      <Button type="button" variant="secondary" onClick={onPublish} className="max-sm:w-full">
        <Upload aria-hidden />
        Publish changes
      </Button>
    </div>
  );
}

/**
 * P10 (102 I08): what the owner's Amped.Bio page shows. The page choice and
 * the badge switches are edited in Page settings (108); this card states the
 * result and links there.
 */
function OnYourPageCard({
  name,
  chainId,
  onOpenIdentity,
}: {
  name: RnsNameState;
  chainId: number;
  onOpenIdentity: () => void;
}) {
  const { profile, setActivePanelAndNavigate } = useEditor();
  const fullName = formatRnsName(name.label, chainId);
  const pageLabel = profile.revoName ? parseRnsInput(profile.revoName, chainId) : "";
  const shown = pageLabel === name.label;
  const bound = isBound(name);
  const pageUrl = profile.handle ? `amped.bio/${profile.handle}` : "your page";

  let line: React.ReactNode;
  if (!bound) {
    line = name.resolvedAddress
      ? `This RNS name points to ${shortAddress(name.resolvedAddress)}. It shows on your page only when it points to your wallet.`
      : "This RNS name does not point to a wallet. It shows on your page only when it points to your wallet.";
  } else if (shown) {
    line = (
      <span className="flex items-center gap-1.5 text-prism-success">
        <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0" />
        {fullName} shows on {pageUrl}.
      </span>
    );
  } else if (pageLabel) {
    line = `Your page shows ${formatRnsName(pageLabel, chainId)}. Choose this name in Page settings to show it instead.`;
  } else {
    line = `Your page shows no RNS name. Choose ${fullName} in Page settings to show it.`;
  }

  return (
    <section aria-labelledby="on-your-page-title" className="prism-glass-clear space-y-3 p-[21px]">
      <div id="on-your-page-title">
        <Eyebrow>On your Amped.Bio page</Eyebrow>
      </div>
      <p className="text-prism-body text-prism-ink">{line}</p>
      {RNS_FLAGS.identity && bound && name.verified === true && (
        <p className="flex items-center gap-1.5 text-prism-meta text-prism-ink-2">
          <ShieldCheck aria-hidden className="h-4 w-4 shrink-0 text-prism-nav" />
          The Verified badge can show with this name.
        </p>
      )}
      {RNS_FLAGS.identity && name.verified === false && (
        <div className="flex flex-wrap items-center gap-2">
          <RowBadge>Not verified</RowBadge>
          <Button type="button" variant="ghost" onClick={onOpenIdentity}>
            Get verified
          </Button>
        </div>
      )}
      <Button
        type="button"
        variant="ghost"
        className="-ml-3"
        onClick={() => setActivePanelAndNavigate("page")}
      >
        Open Page settings
      </Button>
    </section>
  );
}

/** P11 (102 I13): expiry with Extend and Transfer for the owner. */
function ExpiryRow({
  name,
  explorer,
  transferring,
  onExtend,
  onTransfer,
}: {
  name: RnsNameState;
  explorer?: string;
  transferring: boolean;
  onExtend: () => void;
  onTransfer: () => void;
}) {
  if (!name.expiry) return null;
  const expired = name.expiryState === "grace" || name.expiryState === "lapsed";
  return (
    <section className="prism-glass-clear space-y-3 p-[21px]">
      <div className="flex flex-wrap items-start gap-3">
        <CalendarClock aria-hidden className="mt-0.5 h-[21px] w-[21px] shrink-0 text-prism-ink-2" />
        <div className="min-w-0 flex-1">
          <p className="text-prism-label font-semibold text-prism-ink">
            {expired ? "Expired" : "Expires"} {formatRnsDate(name.expiry)}
          </p>
          {name.registeredAt &&
            (name.registrationTx && explorer ? (
              <a
                href={`${explorer}/tx/${name.registrationTx}`}
                target="_blank"
                rel="noopener noreferrer"
                className="prism-focus text-prism-meta text-prism-nav underline-offset-2 hover:underline"
              >
                Registered {formatRnsDate(name.registeredAt)}
                <span className="sr-only"> (opens the transaction in a new tab)</span>
              </a>
            ) : (
              <p className="text-prism-meta text-prism-ink-2">
                Registered {formatRnsDate(name.registeredAt)}
              </p>
            ))}
        </div>
        {name.expiryState !== "active" && <ExpiryBadge name={name} />}
      </div>
      {name.isOwner && (
        <div className="flex flex-wrap gap-2 max-sm:flex-col">
          <Button type="button" variant="secondary" onClick={onExtend} className="max-sm:w-full">
            Extend
          </Button>
          {name.expiryState !== "grace" && name.expiryState !== "lapsed" && (
            <Button type="button" variant="ghost" onClick={onTransfer} className="max-sm:w-full">
              {transferring ? "Transfer in progress, open" : "Transfer"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

/** P12 (102 I14): every ownership value, behind one disclosure. */
function NameDetails({
  name,
  chainId,
  explorer,
}: {
  name: RnsNameState;
  chainId: number;
  explorer?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rows: { label: string; value: React.ReactNode }[] = [];
  if (name.owner) {
    rows.push({
      label: "Owner",
      value: (
        <span className="inline-flex items-center gap-1 tabular-nums">
          {shortAddress(name.owner)}
          <CopyButton value={name.owner} label="Copy owner address" />
        </span>
      ),
    });
  }
  if (name.resolver) {
    rows.push({
      label: "Resolver",
      value: (
        <span className="inline-flex items-center gap-1 tabular-nums">
          {shortAddress(name.resolver)}
          <CopyButton value={name.resolver} label="Copy resolver address" />
        </span>
      ),
    });
  }
  const token = name.tokenId.toString();
  rows.push({
    label: "Token ID",
    value: (
      <span className="inline-flex min-w-0 items-center gap-1 tabular-nums">
        <span className="max-w-[160px] truncate sm:max-w-[220px]">{token}</span>
        <CopyButton value={token} label="Copy token ID" />
      </span>
    ),
  });
  if (name.registeredAt) {
    rows.push({ label: "Registered", value: formatRnsDate(name.registeredAt) });
  }
  if (name.expiry) rows.push({ label: "Expires", value: formatRnsDate(name.expiry) });
  if (name.graceEnd) rows.push({ label: "Grace period ends", value: formatRnsDate(name.graceEnd) });
  rows.push({ label: "Parent", value: getRnsSuffix(chainId).replace(/^\./, "") });

  return (
    <section className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className="prism-focus flex min-h-commit w-full items-center justify-between gap-3 rounded-prism-8 px-3 text-left"
      >
        <span>
          <span className="block text-prism-label font-semibold text-prism-ink">Name details</span>
          <span className="block text-prism-meta text-prism-ink-2">
            Owner, resolver, token, dates
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "h-[21px] w-[21px] shrink-0 text-prism-ink-3 transition-transform duration-prism-control motion-reduce:transition-none",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div id={panelId} className="space-y-2">
          <dl className="prism-slab divide-y divide-prism-line">
            {rows.map(row => (
              <div
                key={row.label}
                className="flex min-h-touch items-center justify-between gap-4 px-4 py-2"
              >
                <dt className="shrink-0 text-prism-label text-prism-ink-2">{row.label}</dt>
                <dd className="min-w-0 text-right text-prism-label font-semibold text-prism-ink">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          <Button type="button" variant="ghost" onClick={name.refetch}>
            <RefreshCw aria-hidden />
            Refresh
          </Button>
        </div>
      )}
      {name.owner && explorer && (
        <ExplorerLink href={`${explorer}/address/${name.owner}`}>View on explorer</ExplorerLink>
      )}
    </section>
  );
}

/**
 * Screen Review 102: the RNS name page Profile tab. Left, the published
 * records with Edit profile and the sync line. Right, what the page shows,
 * the expiry row with Extend and Transfer, and Name details. A viewer who is
 * not the owner sees the records and details only (I20).
 */
export function ProfileTab({
  name,
  chainId,
  explorer,
  rows,
  banner,
  transferring,
  onChangeBanner,
  onPublish,
  onExtend,
  onTransfer,
  onOpenIdentity,
}: {
  name: RnsNameState;
  chainId: number;
  explorer?: string;
  rows: PublishRow[];
  banner: PendingBanner | null;
  transferring: boolean;
  onChangeBanner: () => void;
  onPublish: () => void;
  onExtend: () => void;
  onTransfer: () => void;
  onOpenIdentity: () => void;
}) {
  const { setActivePanelAndNavigate } = useEditor();
  const fullName = formatRnsName(name.label, chainId);
  return (
    <div className="grid gap-[21px] lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="min-w-0 space-y-3">
        <RecordCard name={name} chainId={chainId} banner={banner} onChangeBanner={onChangeBanner} />
        {name.isOwner && (
          <>
            <p className="text-prism-meta text-prism-ink-2">
              Published to your RNS name. Apps and wallets that read RNS see this profile.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setActivePanelAndNavigate("page")}
              >
                Edit profile
              </Button>
            </div>
            <SyncLine rows={rows} fullName={fullName} onPublish={onPublish} />
          </>
        )}
      </div>
      <div className="min-w-0 space-y-[21px]">
        {name.isOwner && (
          <OnYourPageCard name={name} chainId={chainId} onOpenIdentity={onOpenIdentity} />
        )}
        <ExpiryRow
          name={name}
          explorer={explorer}
          transferring={transferring}
          onExtend={onExtend}
          onTransfer={onTransfer}
        />
        <NameDetails name={name} chainId={chainId} explorer={explorer} />
      </div>
    </div>
  );
}
