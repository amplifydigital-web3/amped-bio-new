import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeCanvas } from "qrcode.react";
import { trpc, trpcClient } from "@repo/ui";
import {
  CAMPAIGN_CHANNELS,
  type AnalyticsRangePreset,
  type CampaignChannel,
} from "@repo/constants";
import {
  Archive,
  ArchiveRestore,
  Check,
  Copy,
  Download,
  Loader2,
  Plus,
  QrCode,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { AnalyticsCard } from "./AnalyticsCard";
import { DEFINITIONS, SOURCES } from "./definitions";
import type { AnalyticsCampaign } from "./format";
import { RANGE_LABELS, formatNumber, formatPercent } from "./format";
import { HowTo } from "./HowTo";

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

function CampaignRow({ campaign, handle }: { campaign: AnalyticsCampaign; handle: string }) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const url = campaignUrl(handle, campaign);

  const archive = useMutation({
    mutationFn: () =>
      trpcClient.analytics.archiveCampaign.mutate({
        id: campaign.id,
        archived: !campaign.archived,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: trpc.analytics.campaigns.pathKey() }),
    onError: () => toast.error("Could not update the campaign"),
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed. Select the link and copy it manually.");
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

  return (
    <li className={`py-3 ${campaign.archived ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">
            {campaign.name}
            {campaign.archived && (
              <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                Archived
              </span>
            )}
          </p>
          <p className="text-xs text-gray-500">
            {CHANNEL_LABELS[campaign.channel as CampaignChannel] ?? campaign.channel} · Campaign ID{" "}
            {campaign.id}
          </p>
        </div>
        <dl className="flex gap-4 text-right text-xs">
          <div>
            <dt className="text-gray-500">Views</dt>
            <dd className="text-sm font-semibold tabular-nums text-gray-900">
              {formatNumber(campaign.views)}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Visitors</dt>
            <dd className="text-sm font-semibold tabular-nums text-gray-900">
              {formatNumber(campaign.visitors)}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Clicks</dt>
            <dd className="text-sm font-semibold tabular-nums text-gray-900">
              {formatNumber(campaign.clicks)}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Click-through</dt>
            <dd className="text-sm font-semibold tabular-nums text-gray-900">
              {campaign.visitors > 0 ? formatPercent(campaign.clickers / campaign.visitors) : "–"}
            </dd>
          </div>
        </dl>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="flex-1 min-w-0 truncate rounded-md bg-gray-50 border border-gray-200 px-2 py-1.5 text-[11px] text-gray-700">
          {url}
        </code>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy link"}
        </button>
        <button
          type="button"
          onClick={() => setShowQr(open => !open)}
          aria-expanded={showQr}
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
        >
          <QrCode className="w-3.5 h-3.5" />
          QR code
        </button>
        <button
          type="button"
          onClick={() => archive.mutate()}
          disabled={archive.isPending}
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
        >
          {campaign.archived ? (
            <ArchiveRestore className="w-3.5 h-3.5" />
          ) : (
            <Archive className="w-3.5 h-3.5" />
          )}
          {campaign.archived ? "Restore" : "Archive"}
        </button>
      </div>
      {showQr && (
        <div className="mt-3 flex items-center gap-4">
          <div ref={qrRef} className="p-2 bg-white border border-gray-200 rounded-lg">
            <QRCodeCanvas value={url} size={128} marginSize={1} />
          </div>
          <div className="text-xs text-gray-600 space-y-2">
            <p>
              Scans are reported under this campaign and as the source of the channel you picked.
            </p>
            <button
              type="button"
              onClick={downloadQr}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 font-medium text-gray-800 hover:bg-gray-50"
            >
              <Download className="w-3.5 h-3.5" />
              Download PNG
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Saved campaigns with their own links and QR codes. Each link carries the
 * campaign ID (utm_id), so results roll up by campaign even if names change.
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
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<CampaignChannel>("instagram");
  const [showArchived, setShowArchived] = useState(false);

  const { data, isLoading, isError } = useQuery(
    trpc.analytics.campaigns.queryOptions({ range, tzOffsetMinutes })
  );

  const create = useMutation({
    mutationFn: () => trpcClient.analytics.createCampaign.mutate({ name: name.trim(), channel }),
    onSuccess: async () => {
      setName("");
      await queryClient.invalidateQueries({ queryKey: trpc.analytics.campaigns.pathKey() });
      toast.success("Campaign created. Copy its link and use it where you share your page.");
    },
    onError: (error: Error) => toast.error(error.message || "Could not create the campaign"),
  });

  const campaigns = (data?.campaigns ?? []).filter(item => showArchived || !item.archived);
  const archivedCount = (data?.campaigns ?? []).filter(item => item.archived).length;

  return (
    <AnalyticsCard
      id="campaigns"
      title="Campaigns"
      description="Create a link for each place you share your page, then compare which one works."
      info={DEFINITIONS.campaigns}
      source={SOURCES.campaigns}
      period={RANGE_LABELS[range]}
      updatedAt={data?.generatedAt}
    >
      <HowTo
        storageKey="campaigns"
        title="How campaign links work"
        steps={[
          "Name the campaign after what you are promoting, for example Summer drop.",
          "Pick where you will share it. Choose QR code for posters, merch or events.",
          "Copy the link and paste it in that one place only, such as your Instagram bio.",
          "Come back here to compare views, clicks and click-through for each campaign.",
        ]}
      />

      <form
        className="mt-3 grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-end"
        onSubmit={event => {
          event.preventDefault();
          if (name.trim().length >= 2) create.mutate();
        }}
      >
        <label className="text-xs font-medium text-gray-600" htmlFor="campaign-name">
          Campaign name
          <input
            id="campaign-name"
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="e.g. Summer drop"
            maxLength={80}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
        </label>
        <label className="text-xs font-medium text-gray-600" htmlFor="campaign-channel">
          Where will you share it?
          <select
            id="campaign-channel"
            value={channel}
            onChange={event => setChannel(event.target.value as CampaignChannel)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white"
          >
            {CAMPAIGN_CHANNELS.map(value => (
              <option key={value} value={value}>
                {CHANNEL_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={create.isPending || name.trim().length < 2}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {create.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          Create link
        </button>
      </form>

      {isLoading ? (
        <div className="mt-4 h-24 bg-gray-100 rounded animate-pulse" />
      ) : isError ? (
        <p className="mt-4 text-sm text-red-700">Could not load campaigns.</p>
      ) : campaigns.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">
          No campaigns yet. Create your first link above.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100">
          {campaigns.map(campaign => (
            <CampaignRow key={campaign.id} campaign={campaign} handle={handle} />
          ))}
        </ul>
      )}
      {archivedCount > 0 && (
        <button
          type="button"
          onClick={() => setShowArchived(value => !value)}
          className="mt-2 text-xs font-medium text-gray-600 underline"
        >
          {showArchived ? "Hide archived campaigns" : `Show ${archivedCount} archived`}
        </button>
      )}
    </AnalyticsCard>
  );
}
