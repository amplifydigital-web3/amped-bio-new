import { env } from "../../env";
import type {
  AnalyticsSummary,
  AudienceSummary,
  BreakdownRow,
  HeatmapCell,
  LinkPerformance,
} from "./queries";

export type InsightTone = "positive" | "negative" | "neutral" | "action";

export type AnalyticsInsight = {
  id: string;
  tone: InsightTone;
  title: string;
  detail: string;
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const pct = (value: number) => `${Math.round(value * 100)}%`;

function formatHour(hour: number) {
  const suffix = hour < 12 ? "am" : "pm";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${suffix}`;
}

function change(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

export type InsightInput = {
  summary: AnalyticsSummary;
  previous: AnalyticsSummary | null;
  sources: BreakdownRow[];
  devices: BreakdownRow[];
  links: LinkPerformance[];
  heatmap: HeatmapCell[];
  audience?: AudienceSummary | null;
};

/**
 * Deterministic insights computed from the creator's own numbers. They run on
 * every request at no cost and do not depend on any third party.
 */
export function buildInsights({
  summary,
  previous,
  sources,
  devices,
  links,
  heatmap,
  audience,
}: InsightInput): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];

  if (summary.views === 0) {
    insights.push({
      id: "no-traffic",
      tone: "action",
      title: "Share your page to start collecting data",
      detail:
        "Add your Amped Bio link to your Instagram, TikTok and X bios. Tag each placement with a UTM link from the Campaign links tool so you can see which one drives visits.",
    });
    return insights;
  }

  // Period over period movement
  if (previous) {
    const viewChange = change(summary.views, previous.views);
    if (viewChange !== null && Math.abs(viewChange) >= 0.2) {
      insights.push({
        id: "views-change",
        tone: viewChange > 0 ? "positive" : "negative",
        title: `Page views ${viewChange > 0 ? "up" : "down"} ${pct(Math.abs(viewChange))} vs previous period`,
        detail: `${summary.views.toLocaleString()} views this period against ${previous.views.toLocaleString()} before.`,
      });
    }
    const ctrChange = summary.ctr - previous.ctr;
    if (previous.views > 0 && Math.abs(ctrChange) >= 0.05) {
      insights.push({
        id: "ctr-change",
        tone: ctrChange > 0 ? "positive" : "negative",
        title: `Click rate ${ctrChange > 0 ? "improved" : "dropped"} to ${pct(summary.ctr)}`,
        detail: `It was ${pct(previous.ctr)} in the previous period.`,
      });
    }
  }

  // Leading traffic source
  const totalSourceViews = sources.reduce((sum, row) => sum + row.views, 0);
  const topSource = sources[0];
  if (topSource && totalSourceViews > 0) {
    const share = topSource.views / totalSourceViews;
    insights.push({
      id: "top-source",
      tone: "neutral",
      title: `${topSource.label} drives ${pct(share)} of your visits`,
      detail:
        share > 0.6
          ? "Most of your audience depends on one channel. Placing your link on a second platform reduces that concentration risk."
          : "Your traffic is spread across several channels.",
    });
  }

  const direct = sources.find(row => row.label === "Direct");
  if (direct && totalSourceViews > 0 && direct.views / totalSourceViews >= 0.4) {
    insights.push({
      id: "untagged-traffic",
      tone: "action",
      title: `${pct(direct.views / totalSourceViews)} of visits have no known source`,
      detail:
        "In-app browsers often hide where a visitor came from. Use tagged campaign links in each bio so these visits are attributed.",
    });
  }

  // Best time of week
  const peak = heatmap.reduce<HeatmapCell | null>(
    (best, cell) => (!best || cell.views > best.views ? cell : best),
    null
  );
  if (peak && summary.views >= 20) {
    insights.push({
      id: "peak-time",
      tone: "neutral",
      title: `Busiest time: ${DAY_NAMES[peak.day]} around ${formatHour(peak.hour)}`,
      detail:
        "Posting shortly before this window puts new content in front of your most active audience.",
    });
  }

  // Link ordering: a lower placed link outperforming the top link
  const activeLinks = links.filter(link => !link.deleted);
  if (activeLinks.length >= 2 && summary.clicks >= 10) {
    const byPosition = [...activeLinks].sort((a, b) => a.order - b.order);
    const best = [...activeLinks].sort((a, b) => b.clicks - a.clicks)[0];
    const bestPosition = byPosition.findIndex(link => link.blockId === best.blockId);
    if (bestPosition >= 2) {
      insights.push({
        id: "reorder-links",
        tone: "action",
        title: `Move "${best.label}" higher`,
        detail: `It is your most clicked link but sits in position ${bestPosition + 1}. Links near the top usually get more clicks.`,
      });
    }

    const idle = activeLinks.filter(link => link.clicks === 0);
    if (idle.length > 0 && summary.views >= 50) {
      insights.push({
        id: "idle-links",
        tone: "action",
        title: `${idle.length} link${idle.length > 1 ? "s" : ""} received no clicks`,
        detail: `Consider renaming or removing: ${idle
          .slice(0, 3)
          .map(link => `"${link.label}"`)
          .join(", ")}${idle.length > 3 ? " and others" : ""}.`,
      });
    }
  }

  // Device mix
  const totalDeviceViews = devices.reduce((sum, row) => sum + row.views, 0);
  const mobile = devices.find(row => row.label === "mobile");
  if (mobile && totalDeviceViews > 0 && mobile.views / totalDeviceViews >= 0.7) {
    insights.push({
      id: "mobile-first",
      tone: "neutral",
      title: `${pct(mobile.views / totalDeviceViews)} of visitors are on mobile`,
      detail: "Keep link labels short and put the most important action in the first screen.",
    });
  }

  if (audience && audience.consentedVisitors >= 20) {
    const share = audience.returningVisitors / audience.consentedVisitors;
    insights.push({
      id: "returning",
      tone: share >= 0.25 ? "positive" : "neutral",
      title: `${pct(share)} of opted-in visitors came back`,
      detail:
        share >= 0.25
          ? "You have a loyal core audience. Give them a reason to return, such as a weekly update link."
          : "Most visitors come once. Pin one link that changes often, such as your latest release.",
    });
  }

  if (audience && audience.newMembers > 0) {
    insights.push({
      id: "members",
      tone: "positive",
      title: `${audience.newMembers} new member${audience.newMembers === 1 ? "" : "s"} joined through your page`,
      detail: `That is ${pct(audience.memberConversion)} of unique visitors. Members are people who created an Amped Bio account from your page.`,
    });
  }

  if (summary.avgEngagementSeconds > 0) {
    insights.push({
      id: "engagement",
      tone: summary.avgEngagementSeconds >= 20 ? "positive" : "neutral",
      title: `Visitors stay ${summary.avgEngagementSeconds}s on average`,
      detail:
        summary.avgEngagementSeconds >= 20
          ? "People are reading your page. Media and text blocks are working."
          : "Most visitors decide quickly. A clear first link helps.",
    });
  }

  return insights;
}

/**
 * Optional narrative summary written by Claude from the aggregated numbers.
 * Only aggregate metrics are sent. No visitor level data leaves the server.
 */
export async function generateAiSummary(input: InsightInput & { rangeLabel: string }) {
  if (!env.ANTHROPIC_API_KEY) return null;

  const payload = {
    range: input.rangeLabel,
    summary: input.summary,
    previous: input.previous,
    topSources: input.sources.slice(0, 5),
    devices: input.devices,
    audience: input.audience ?? null,
    links: input.links.slice(0, 10).map(link => ({
      label: link.label,
      position: link.order + 1,
      clicks: link.clicks,
      ctr: Number(link.ctr.toFixed(3)),
    })),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 400,
        system:
          "You analyze link-in-bio page analytics for a creator. Write three short bullet points in plain English: what happened, why it likely happened, and one specific action to take this week. Use only the numbers provided. Do not invent data. No em dashes. No hype.",
        messages: [{ role: "user", content: JSON.stringify(payload) }],
      }),
    });

    if (!response.ok) {
      console.error("[ANALYTICS] AI summary request failed", response.status);
      return null;
    }

    const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find(part => part.type === "text")?.text?.trim();
    return text || null;
  } catch (error) {
    console.error("[ANALYTICS] AI summary error", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
