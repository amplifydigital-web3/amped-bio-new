import { useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { QRCodeCanvas } from "qrcode.react";
import {
  Badge,
  Button,
  EmptyState,
  ErrorCard,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
  trpc,
  trpcClient,
} from "@repo/ui";
import {
  CAMPAIGN_CHANNELS,
  type AnalyticsRangePreset,
  type CampaignChannel,
} from "@repo/constants";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  Check,
  Copy,
  Download,
  Link2,
  Loader2,
  QrCode,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { AnalyticsCard } from "./AnalyticsCard";
import { DEFINITIONS, SOURCES } from "./definitions";
import type { AnalyticsCampaign } from "./format";
import { formatNumber, formatPercent } from "./format";
import { HowTo } from "./HowTo";
import { SkeletonRows } from "./Skeleton";

const UNDO_MS = 8000;
const MIN_NAME = 2;

const CHANNEL_LABELS: Record<CampaignChannel, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  threads: "Threads",
  facebook: "Facebook",
  newsletter: "Newsletter or email",
  qr: "QR code (print, merch, events)",
  other: "Somewhere else",
};

const HOW_TO_STEPS = [
  "Name the campaign after what you are promoting, for example Summer drop.",
  "Pick where you will share it. Choose QR code for posters, merch or events.",
  "Copy the link and paste it in that one place only, such as your Instagram bio.",
  "Come back here to compare views, clicks and click-through for each campaign.",
];

const EMPTY_BODY =
  "Create a link for each place you share your page, then compare which one works.";

function mediumFor(channel: string) {
  if (channel === "qr") return "offline";
  if (channel === "newsletter") return "email";
  return "social";
}

export function campaignUrl(
  handle: string,
  campaign: Pick<AnalyticsCampaign, "id" | "slug" | "channel">
) {
  const params = new URLSearchParams({
    utm_source: campaign.channel,
    utm_medium: mediumFor(campaign.channel),
    utm_campaign: campaign.slug,
    utm_id: String(campaign.id),
  });
  return `${import.meta.env.VITE_LANDINGPAGE_URL}/${handle}?${params.toString()}`;
}

function channelLabel(channel: string) {
  return CHANNEL_LABELS[channel as CampaignChannel] ?? channel;
}

function clickThrough(campaign: AnalyticsCampaign) {
  return campaign.visitors > 0 ? formatPercent(campaign.clickers / campaign.visitors) : "–";
}

// 093 I31: Views and Click-through at 390; all four from md
const FIGURES: Array<{
  label: string;
  value: (campaign: AnalyticsCampaign) => string;
  mobile: boolean;
}> = [
  { label: "Views", value: c => formatNumber(c.views), mobile: true },
  { label: "Visitors", value: c => formatNumber(c.visitors), mobile: false },
  { label: "Clicks", value: c => formatNumber(c.clicks), mobile: false },
  { label: "Click-through", value: clickThrough, mobile: true },
];

const FIGURE_GRID =
  "grid-cols-[minmax(0,1fr)_68px_96px] md:grid-cols-[minmax(0,1fr)_89px_89px_89px_110px]";

function useArchive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      trpcClient.analytics.archiveCampaign.mutate({ id, archived }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: trpc.analytics.campaigns.pathKey() }),
  });
}

/** 093 I31: the open row's lens: link, copy, QR, archive or restore, and the campaign ID. */
function CampaignLens({
  campaign,
  handle,
  onArchived,
}: {
  campaign: AnalyticsCampaign;
  handle: string;
  onArchived: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const qrId = useId();
  const url = campaignUrl(handle, campaign);
  const archive = useArchive();
  const queryClient = useQueryClient();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.add({ type: "error", title: "Copy failed. Select the link and copy it manually." });
    }
  };

  const downloadQr = () => {
    const canvas = qrRef.current?.querySelector("canvas");
    if (!canvas) return;
    const anchor = document.createElement("a");
    anchor.href = canvas.toDataURL("image/png");
    anchor.download = `${handle}-${campaign.slug}-qr.png`;
    anchor.click();
  };

  // 093 I32: no confirm. The toast offers Undo for 8 seconds.
  const archiveNow = () => {
    archive.mutate(
      { id: campaign.id, archived: true },
      {
        onSuccess: () => {
          onArchived();
          toast.add({
            type: "info",
            title: "Campaign archived",
            duration: UNDO_MS,
            actionProps: {
              children: "Undo",
              // The lens has closed by now, so Undo calls the API directly
              onClick: () =>
                void trpcClient.analytics.archiveCampaign
                  .mutate({ id: campaign.id, archived: false })
                  .catch(() => toast.add({ type: "error", title: "Could not update the campaign" }))
                  .finally(
                    () =>
                      void queryClient.invalidateQueries({
                        queryKey: trpc.analytics.campaigns.pathKey(),
                      })
                  ),
            },
          });
        },
        onError: () => toast.add({ type: "error", title: "Could not update the campaign" }),
      }
    );
  };

  const restore = () =>
    archive.mutate(
      { id: campaign.id, archived: false },
      { onError: () => toast.add({ type: "error", title: "Could not update the campaign" }) }
    );

  return (
    <div className="space-y-[13px] px-[13px] pb-[13px] md:px-[21px] md:pb-[21px]">
      <div className="prism-well flex h-touch min-w-0 items-center px-3">
        <span className="sr-only">Campaign link: </span>
        <span className="truncate text-prism-meta text-prism-ink" title={url}>
          {url}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={() => void copy()} aria-live="polite">
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          aria-expanded={showQr}
          aria-controls={qrId}
          onClick={() => setShowQr(open => !open)}
        >
          <QrCode aria-hidden />
          QR code
        </Button>
        {campaign.archived ? (
          <Button
            type="button"
            variant="secondary"
            disabled={archive.isPending}
            aria-busy={archive.isPending}
            onClick={restore}
          >
            <ArchiveRestore aria-hidden />
            Restore
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            disabled={archive.isPending}
            aria-busy={archive.isPending}
            onClick={archiveNow}
          >
            <Archive aria-hidden />
            Archive
          </Button>
        )}
      </div>
      {showQr && (
        <div id={qrId} className="flex flex-wrap items-center gap-[21px]">
          <div ref={qrRef} className="rounded-prism-13 bg-white p-2">
            <QRCodeCanvas
              value={url}
              size={144}
              marginSize={1}
              aria-label={`QR code for ${campaign.name}`}
              role="img"
            />
          </div>
          <div className="max-w-[34ch] space-y-[13px]">
            <p className="text-prism-meta text-prism-ink-2">
              Scans are reported under this campaign and as the source of the channel you picked.
            </p>
            <Button type="button" variant="secondary" onClick={downloadQr}>
              <Download aria-hidden />
              Download PNG
            </Button>
          </div>
        </div>
      )}
      <p className="text-prism-meta text-prism-ink-2">Campaign ID {campaign.id}</p>
    </div>
  );
}

/** 093 I31: a G0 row 55. Opening it makes it the region's one G3 lens. */
function CampaignRow({
  campaign,
  handle,
  open,
  onToggle,
  onArchived,
}: {
  campaign: AnalyticsCampaign;
  handle: string;
  open: boolean;
  onToggle: () => void;
  onArchived: () => void;
}) {
  const panelId = useId();
  const muted = campaign.archived;
  return (
    <li className={cn(open ? "prism-lens my-2" : "border-b border-prism-line last:border-b-0")}>
      {open && <span aria-hidden className="prism-rim" />}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          "prism-focus relative grid min-h-commit w-full items-center gap-[13px] rounded-prism-13 py-1 text-left",
          FIGURE_GRID,
          open && "px-[13px] md:px-[21px]"
        )}
      >
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "truncate text-prism-label font-semibold",
                muted ? "text-prism-ink-2" : "text-prism-ink"
              )}
            >
              {campaign.name}
            </span>
            {muted && (
              <Badge variant="secondary" className="shrink-0">
                Archived
              </Badge>
            )}
          </span>
          <span className="block truncate text-prism-meta text-prism-ink-2">
            {channelLabel(campaign.channel)}
          </span>
        </span>
        {FIGURES.map(figure => (
          <span
            key={figure.label}
            className={cn(
              "text-right text-prism-label font-semibold tabular-nums",
              muted ? "text-prism-ink-2" : "text-prism-ink",
              !figure.mobile && "hidden md:block"
            )}
          >
            <span className="sr-only">{figure.label} </span>
            {figure.value(campaign)}
          </span>
        ))}
      </button>
      {open && (
        <div id={panelId} className="relative">
          <CampaignLens campaign={campaign} handle={handle} onArchived={onArchived} />
        </div>
      )}
    </li>
  );
}

/** 093 I30: name and channel in one row at 1440, one column at 390. */
function CreateCampaignForm({ onCreated }: { onCreated: (id: string) => void }) {
  const queryClient = useQueryClient();
  const nameId = useId();
  const channelLabelId = useId();
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | undefined>();
  const [channel, setChannel] = useState<CampaignChannel>("instagram");
  const [serverError, setServerError] = useState<string | undefined>();

  const validate = (value: string) =>
    value.trim().length < MIN_NAME ? "Use at least 2 characters." : undefined;

  const create = useMutation({
    mutationFn: () => trpcClient.analytics.createCampaign.mutate({ name: name.trim(), channel }),
    onSuccess: async campaign => {
      setName("");
      setServerError(undefined);
      await queryClient.invalidateQueries({ queryKey: trpc.analytics.campaigns.pathKey() });
      if (campaign) onCreated(campaign.id);
      toast.add({
        type: "success",
        title: "Campaign created. Copy its link and use it where you share your page.",
      });
    },
    onError: (error: unknown) => {
      // The 200 limit and name conflicts carry plain messages; anything else stays generic
      const code = error instanceof TRPCClientError ? error.data?.code : undefined;
      setServerError(
        code === "BAD_REQUEST" || code === "CONFLICT"
          ? (error as Error).message
          : "Could not create the campaign"
      );
    },
  });

  return (
    <form
      noValidate
      onSubmit={event => {
        event.preventDefault();
        const error = validate(name);
        setNameError(error);
        if (!error) create.mutate();
      }}
    >
      <div className="grid gap-[13px] md:grid-cols-[minmax(0,1fr)_233px_auto] md:items-start">
        <Input
          id={nameId}
          label="Campaign name"
          value={name}
          onChange={event => {
            setName(event.target.value);
            if (nameError) setNameError(validate(event.target.value));
          }}
          onBlur={() => name && setNameError(validate(name))}
          placeholder="Summer drop"
          maxLength={80}
          autoComplete="off"
          error={nameError}
        />
        <div className="space-y-2">
          <label
            id={channelLabelId}
            className="block font-prism text-prism-label font-semibold text-prism-ink"
          >
            Where will you share it?
          </label>
          <Select value={channel} onValueChange={value => setChannel(value as CampaignChannel)}>
            <SelectTrigger aria-labelledby={channelLabelId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CAMPAIGN_CHANNELS.map(value => (
                <SelectItem key={value} value={value}>
                  {CHANNEL_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Label height (20) plus the 8 gap keeps the button on the wells' line */}
        <Button
          type="submit"
          size="lg"
          disabled={create.isPending}
          aria-busy={create.isPending}
          className="md:mt-[28px] md:h-touch"
        >
          {create.isPending ? (
            <Loader2 aria-hidden className="motion-safe:animate-spin" />
          ) : (
            <Link2 aria-hidden />
          )}
          Create link
        </Button>
      </div>
      {serverError && (
        <p
          role="alert"
          className="mt-[13px] flex items-start gap-1.5 font-prism text-prism-meta text-prism-danger"
        >
          <AlertCircle aria-hidden className="mt-px h-4 w-4 shrink-0" />
          {serverError}
        </p>
      )}
    </form>
  );
}

/**
 * Screen Review 093 I30 to I33, I41: campaign links on the Campaigns tab.
 * Each link carries the campaign ID (utm_id), so results roll up by campaign
 * even if names change.
 */
export function CampaignsCard({
  handle,
  range,
  tzOffsetMinutes,
}: {
  handle: string;
  range: AnalyticsRangePreset;
  tzOffsetMinutes: number;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery(
    trpc.analytics.campaigns.queryOptions({ range, tzOffsetMinutes })
  );

  const all = data?.campaigns ?? [];
  const archivedCount = all.filter(item => item.archived).length;
  const shown = all.filter(item => showArchived || !item.archived);
  const empty = !!data && all.length === 0;

  return (
    <AnalyticsCard
      id="campaigns"
      title="Campaign links"
      description={empty ? undefined : EMPTY_BODY}
      info={DEFINITIONS.campaigns}
      source={SOURCES.campaigns}
    >
      <CreateCampaignForm onCreated={setOpenId} />

      <div className="mt-[21px]">
        {isError ? (
          <ErrorCard
            title="Campaigns did not load"
            onRetry={() => void refetch()}
            retryLabel="Retry"
          />
        ) : isLoading || !data ? (
          <SkeletonRows count={2} active={isLoading} />
        ) : empty ? (
          <EmptyState icon={Link2} title="No campaigns yet" description={EMPTY_BODY} />
        ) : (
          <>
            {shown.length > 0 && (
              <>
                <div
                  aria-hidden
                  className={cn(
                    "grid gap-[13px] pb-1 text-prism-meta text-prism-ink-2",
                    FIGURE_GRID
                  )}
                >
                  <span>Campaign</span>
                  {FIGURES.map(figure => (
                    <span
                      key={figure.label}
                      className={cn("text-right", !figure.mobile && "hidden md:block")}
                    >
                      {figure.label}
                    </span>
                  ))}
                </div>
                <ul className="border-t border-prism-line">
                  {shown.map(campaign => (
                    <CampaignRow
                      key={campaign.id}
                      campaign={campaign}
                      handle={handle}
                      open={openId === campaign.id}
                      onToggle={() =>
                        setOpenId(current => (current === campaign.id ? null : campaign.id))
                      }
                      onArchived={() => setOpenId(null)}
                    />
                  ))}
                </ul>
              </>
            )}
            {archivedCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                className="mt-2 -ml-3"
                aria-pressed={showArchived}
                onClick={() => setShowArchived(value => !value)}
              >
                {showArchived ? "Hide archived" : `Show ${archivedCount} archived`}
              </Button>
            )}
          </>
        )}
      </div>

      {data && (
        <HowTo
          storageKey="campaigns"
          title="How campaign links work"
          steps={HOW_TO_STEPS}
          defaultOpen={empty}
          className="mt-[21px]"
        />
      )}
    </AnalyticsCard>
  );
}
