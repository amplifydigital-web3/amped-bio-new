import { Prisma } from "../../lib/prisma/index.js";
import type {
  AnalyticsBreakdownDimension,
  AnalyticsRangeInput,
  AnalyticsRangePreset,
} from "@repo/constants";
import { prisma } from "../DB";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const RANGE_MS: Record<Exclude<AnalyticsRangePreset, "all">, number> = {
  "24h": DAY_MS,
  "7d": 7 * DAY_MS,
  "28d": 28 * DAY_MS,
  "90d": 90 * DAY_MS,
  "365d": 365 * DAY_MS,
};

// Whitelisted columns for breakdowns. Never interpolate user input into SQL.
const DIMENSION_COLUMNS: Record<AnalyticsBreakdownDimension, string> = {
  source: "source",
  referrer: "referrer",
  utm_source: "utm_source",
  utm_medium: "utm_medium",
  utm_campaign: "utm_campaign",
  country: "country",
  city: "city",
  device: "device",
  os: "os",
  browser: "browser",
};

const NULLABLE_ONLY_TAGGED = new Set<AnalyticsBreakdownDimension>([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "referrer",
]);

export type ResolvedRange = {
  from: Date;
  to: Date;
  previousFrom: Date | null;
  previousTo: Date | null;
  bucket: "hour" | "day";
  tzOffsetMinutes: number;
};

export async function resolveRange(
  userId: number,
  input: AnalyticsRangeInput
): Promise<ResolvedRange> {
  const to = new Date();

  if (input.range === "all") {
    const first = await prisma.analyticsEvent.findFirst({
      where: { user_id: userId },
      orderBy: { created_at: "asc" },
      select: { created_at: true },
    });
    const from = first?.created_at ?? new Date(to.getTime() - 28 * DAY_MS);
    return {
      from,
      to,
      previousFrom: null,
      previousTo: null,
      bucket: "day",
      tzOffsetMinutes: input.tzOffsetMinutes,
    };
  }

  const length = RANGE_MS[input.range];
  const from = new Date(to.getTime() - length);
  return {
    from,
    to,
    previousFrom: new Date(from.getTime() - length),
    previousTo: from,
    bucket: input.range === "24h" ? "hour" : "day",
    tzOffsetMinutes: input.tzOffsetMinutes,
  };
}

const toNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Prisma.Decimal) return value.toNumber();
  return Number(value);
};

function clickFilter(blockId?: number) {
  return blockId ? Prisma.sql`AND (type <> 'click' OR block_id = ${blockId})` : Prisma.empty;
}

export type AnalyticsSummary = {
  views: number;
  visitors: number;
  clicks: number;
  clickers: number;
  ctr: number;
  visitorCtr: number;
  avgEngagementSeconds: number;
};

export async function getSummary(
  userId: number,
  from: Date,
  to: Date,
  blockId?: number
): Promise<AnalyticsSummary> {
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      SUM(type = 'view') AS views,
      COUNT(DISTINCT CASE WHEN type = 'view' THEN visitor_hash END) AS visitors,
      SUM(type = 'click') AS clicks,
      COUNT(DISTINCT CASE WHEN type = 'click' THEN visitor_hash END) AS clickers,
      AVG(CASE WHEN type = 'engage' THEN duration_ms END) AS avg_engage_ms
    FROM analytics_events
    WHERE user_id = ${userId} AND created_at >= ${from} AND created_at < ${to}
    ${clickFilter(blockId)}
  `;
  const row = rows[0] ?? {};
  const views = toNumber(row.views);
  const visitors = toNumber(row.visitors);
  const clicks = toNumber(row.clicks);
  const clickers = toNumber(row.clickers);
  return {
    views,
    visitors,
    clicks,
    clickers,
    ctr: views > 0 ? clicks / views : 0,
    visitorCtr: visitors > 0 ? Math.min(1, clickers / visitors) : 0,
    avgEngagementSeconds: Math.round(toNumber(row.avg_engage_ms) / 1000),
  };
}

export type TimeseriesPoint = { bucket: string; views: number; visitors: number; clicks: number };

function formatBucket(date: Date, bucket: "hour" | "day") {
  const iso = date.toISOString();
  return bucket === "hour" ? `${iso.slice(0, 13)}:00` : iso.slice(0, 10);
}

export async function getTimeseries(
  userId: number,
  range: ResolvedRange,
  blockId?: number
): Promise<TimeseriesPoint[]> {
  const { from, to, bucket, tzOffsetMinutes } = range;
  const format = bucket === "hour" ? "%Y-%m-%dT%H:00" : "%Y-%m-%d";

  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      DATE_FORMAT(DATE_ADD(created_at, INTERVAL ${tzOffsetMinutes} MINUTE), ${format}) AS bucket,
      SUM(type = 'view') AS views,
      COUNT(DISTINCT CASE WHEN type = 'view' THEN visitor_hash END) AS visitors,
      SUM(type = 'click') AS clicks
    FROM analytics_events
    WHERE user_id = ${userId} AND created_at >= ${from} AND created_at < ${to}
    ${clickFilter(blockId)}
    GROUP BY bucket
    ORDER BY bucket
  `;

  const byBucket = new Map(
    rows.map(row => [
      String(row.bucket),
      {
        views: toNumber(row.views),
        visitors: toNumber(row.visitors),
        clicks: toNumber(row.clicks),
      },
    ])
  );

  // Fill empty buckets so charts show gaps as zero
  const step = bucket === "hour" ? HOUR_MS : DAY_MS;
  const offsetMs = tzOffsetMinutes * 60_000;
  const start = new Date(from.getTime() + offsetMs);
  if (bucket === "hour") start.setUTCMinutes(0, 0, 0);
  else start.setUTCHours(0, 0, 0, 0);
  const end = to.getTime() + offsetMs;

  const points: TimeseriesPoint[] = [];
  for (let t = start.getTime(); t <= end && points.length < 1000; t += step) {
    const key = formatBucket(new Date(t), bucket);
    points.push({ bucket: key, ...(byBucket.get(key) ?? { views: 0, visitors: 0, clicks: 0 }) });
  }
  return points;
}

export type BreakdownRow = { label: string; views: number; visitors: number; clicks: number };

export async function getBreakdown(
  userId: number,
  from: Date,
  to: Date,
  dimension: AnalyticsBreakdownDimension,
  limit: number,
  blockId?: number
): Promise<BreakdownRow[]> {
  const column = Prisma.raw(DIMENSION_COLUMNS[dimension]);
  const order = blockId ? Prisma.sql`clicks DESC, views DESC` : Prisma.sql`views DESC, clicks DESC`;
  // Untagged visits are already visible as sources, so campaign breakdowns only list tagged ones
  const skipEmpty = NULLABLE_ONLY_TAGGED.has(dimension)
    ? Prisma.sql`AND ${column} IS NOT NULL`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      ${column} AS label,
      SUM(type = 'view') AS views,
      COUNT(DISTINCT CASE WHEN type = 'view' THEN visitor_hash END) AS visitors,
      SUM(type = 'click') AS clicks
    FROM analytics_events
    WHERE user_id = ${userId} AND created_at >= ${from} AND created_at < ${to}
      AND type IN ('view', 'click')
    ${skipEmpty}
    ${clickFilter(blockId)}
    GROUP BY ${column}
    ORDER BY ${order}
    LIMIT ${limit}
  `;

  return rows
    .map(row => ({
      label: row.label === null || row.label === "" ? "Unknown" : String(row.label),
      views: toNumber(row.views),
      visitors: toNumber(row.visitors),
      clicks: toNumber(row.clicks),
    }))
    .filter(row => row.views > 0 || row.clicks > 0);
}

export type LinkPerformance = {
  blockId: number;
  label: string;
  url: string | null;
  platform: string | null;
  order: number;
  deleted: boolean;
  clicks: number;
  uniqueClicks: number;
  ctr: number;
  lifetimeClicks: number;
};

type LinkConfig = { label?: string; url?: string; platform?: string };

export async function getLinkPerformance(
  userId: number,
  from: Date,
  to: Date,
  pageViews: number
): Promise<LinkPerformance[]> {
  const [rows, blocks] = await Promise.all([
    prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT block_id, COUNT(*) AS clicks, COUNT(DISTINCT visitor_hash) AS unique_clicks
      FROM analytics_events
      WHERE user_id = ${userId} AND type = 'click' AND block_id IS NOT NULL
        AND created_at >= ${from} AND created_at < ${to}
      GROUP BY block_id
    `,
    prisma.block.findMany({
      where: { user_id: userId, type: "link" },
      select: { id: true, order: true, clicks: true, config: true },
      orderBy: { order: "asc" },
    }),
  ]);

  const clickMap = new Map(
    rows.map(row => [
      toNumber(row.block_id),
      { clicks: toNumber(row.clicks), uniqueClicks: toNumber(row.unique_clicks) },
    ])
  );

  return blocks
    .map(block => {
      const config = (block.config ?? {}) as LinkConfig;
      const stats = clickMap.get(block.id) ?? { clicks: 0, uniqueClicks: 0 };
      return {
        blockId: block.id,
        label: config.label || config.url || `Link ${block.id}`,
        url: config.url ?? null,
        platform: config.platform ?? null,
        order: block.order,
        deleted: false,
        clicks: stats.clicks,
        uniqueClicks: stats.uniqueClicks,
        ctr: pageViews > 0 ? stats.clicks / pageViews : 0,
        lifetimeClicks: block.clicks,
      };
    })
    .sort((a, b) => b.clicks - a.clicks || a.order - b.order);
}

export type HeatmapCell = { day: number; hour: number; views: number };

export async function getHeatmap(userId: number, range: ResolvedRange): Promise<HeatmapCell[]> {
  const { from, to, tzOffsetMinutes } = range;
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      DAYOFWEEK(DATE_ADD(created_at, INTERVAL ${tzOffsetMinutes} MINUTE)) - 1 AS day,
      HOUR(DATE_ADD(created_at, INTERVAL ${tzOffsetMinutes} MINUTE)) AS hour,
      COUNT(*) AS views
    FROM analytics_events
    WHERE user_id = ${userId} AND type = 'view' AND created_at >= ${from} AND created_at < ${to}
    GROUP BY day, hour
  `;
  return rows.map(row => ({
    day: toNumber(row.day),
    hour: toNumber(row.hour),
    views: toNumber(row.views),
  }));
}

export async function getRealtime(userId: number) {
  const since = new Date(Date.now() - 30 * 60_000);
  const [summaryRows, recent] = await Promise.all([
    prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        COUNT(DISTINCT visitor_hash) AS visitors,
        SUM(type = 'view') AS views,
        SUM(type = 'click') AS clicks
      FROM analytics_events
      WHERE user_id = ${userId} AND type IN ('view', 'click') AND created_at >= ${since}
    `,
    prisma.analyticsEvent.findMany({
      where: { user_id: userId, type: { in: ["view", "click"] } },
      orderBy: { created_at: "desc" },
      take: 15,
      select: {
        id: true,
        type: true,
        source: true,
        country: true,
        city: true,
        device: true,
        created_at: true,
        block: { select: { config: true } },
      },
    }),
  ]);

  const row = summaryRows[0] ?? {};
  return {
    generatedAt: new Date(),
    visitors: toNumber(row.visitors),
    views: toNumber(row.views),
    clicks: toNumber(row.clicks),
    recent: recent.map(event => ({
      id: event.id.toString(),
      type: event.type,
      source: event.source,
      country: event.country,
      city: event.city,
      device: event.device,
      createdAt: event.created_at,
      linkLabel: event.block ? (((event.block.config ?? {}) as LinkConfig).label ?? null) : null,
    })),
  };
}

const CSV_EXPORT_LIMIT = 100_000;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  // Neutralize spreadsheet formula injection and escape quotes
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function exportEventsCsv(userId: number, from: Date, to: Date) {
  const events = await prisma.analyticsEvent.findMany({
    where: { user_id: userId, created_at: { gte: from, lt: to } },
    orderBy: { created_at: "asc" },
    take: CSV_EXPORT_LIMIT,
    select: {
      event_id: true,
      session_id: true,
      created_at: true,
      type: true,
      duration_ms: true,
      source: true,
      referrer: true,
      utm_source: true,
      utm_medium: true,
      utm_campaign: true,
      country: true,
      city: true,
      device: true,
      os: true,
      browser: true,
      block: { select: { id: true, config: true } },
      campaign: { select: { id: true, name: true } },
    },
  });

  // Visitor account IDs and long-lived visitor hashes are intentionally left out
  const header = [
    "event_id",
    "session_id",
    "timestamp_utc",
    "event",
    "link_id",
    "link_label",
    "link_url",
    "engaged_seconds",
    "source",
    "referrer",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "campaign_id",
    "campaign_name",
    "country",
    "city",
    "device",
    "os",
    "browser",
  ];

  const lines = events.map(event => {
    const config = (event.block?.config ?? {}) as LinkConfig;
    return [
      event.event_id,
      event.session_id,
      event.created_at,
      event.type,
      event.block?.id,
      config.label,
      config.url,
      event.duration_ms !== null ? Math.round(event.duration_ms / 1000) : null,
      event.source,
      event.referrer,
      event.utm_source,
      event.utm_medium,
      event.utm_campaign,
      event.campaign?.id,
      event.campaign?.name,
      event.country,
      event.city,
      event.device,
      event.os,
      event.browser,
    ]
      .map(csvCell)
      .join(",");
  });

  return {
    csv: [header.join(","), ...lines].join("\n"),
    rowCount: events.length,
    truncated: events.length >= CSV_EXPORT_LIMIT,
  };
}

// ---------------------------------------------------------------------------
// Audience: returning visitors (consented only) and members
// ---------------------------------------------------------------------------

export type AudienceSummary = {
  // Visitors in the period who allowed return-visit measurement
  consentedVisitors: number;
  // Consented visitors who also visited on an earlier day
  returningVisitors: number;
  // Accounts that signed up through this creator's page in the period
  newMembers: number;
  // All accounts that ever signed up through this creator's page
  totalMembers: number;
  // New members divided by unique visitors in the period
  memberConversion: number;
};

export async function getAudienceSummary(
  userId: number,
  range: { from: Date; to: Date; tzOffsetMinutes: number },
  uniqueVisitors: number
): Promise<AudienceSummary> {
  const { from, to, tzOffsetMinutes } = range;
  const [visitorRows, newMembers, totalMembers] = await Promise.all([
    prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        COUNT(*) AS consented,
        SUM(
          DATE(DATE_ADD(r.last_in_range, INTERVAL ${tzOffsetMinutes} MINUTE)) >
          DATE(DATE_ADD(f.first_seen, INTERVAL ${tzOffsetMinutes} MINUTE))
        ) AS returning_visitors
      FROM (
        SELECT persistent_visitor AS pv, MAX(created_at) AS last_in_range
        FROM analytics_events
        WHERE user_id = ${userId} AND type = 'view' AND persistent_visitor IS NOT NULL
          AND created_at >= ${from} AND created_at < ${to}
        GROUP BY persistent_visitor
      ) r
      JOIN (
        SELECT persistent_visitor AS pv, MIN(created_at) AS first_seen
        FROM analytics_events
        WHERE user_id = ${userId} AND type = 'view' AND persistent_visitor IS NOT NULL
          AND created_at < ${to}
        GROUP BY persistent_visitor
      ) f ON f.pv = r.pv
    `,
    prisma.referral.count({ where: { referrerId: userId, createdAt: { gte: from, lt: to } } }),
    prisma.referral.count({ where: { referrerId: userId } }),
  ]);

  const row = visitorRows[0] ?? {};
  return {
    consentedVisitors: toNumber(row.consented),
    returningVisitors: toNumber(row.returning_visitors),
    newMembers,
    totalMembers,
    memberConversion: uniqueVisitors > 0 ? newMembers / uniqueVisitors : 0,
  };
}

export type RetentionCohort = {
  // Monday of the week in which these visitors first visited (YYYY-MM-DD)
  cohortStart: string;
  size: number;
  // Share of the cohort that visited again in week 1, 2, ... after their first visit
  weeks: Array<{ week: number; returned: number; rate: number } | null>;
};

const RETENTION_WEEKS = 8;

/**
 * Weekly retention for visitors who allowed return-visit measurement. Week N
 * counts visits 7N to 7N+6 days after a visitor's first visit. Weeks that have
 * not fully happened yet for a cohort are null.
 */
export async function getRetentionCohorts(
  userId: number,
  tzOffsetMinutes: number
): Promise<RetentionCohort[]> {
  const since = new Date(Date.now() - RETENTION_WEEKS * 7 * DAY_MS);
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    WITH firsts AS (
      SELECT persistent_visitor AS pv, MIN(created_at) AS first_seen
      FROM analytics_events
      WHERE user_id = ${userId} AND type = 'view' AND persistent_visitor IS NOT NULL
      GROUP BY persistent_visitor
      HAVING MIN(created_at) >= ${since}
    )
    SELECT
      DATE_FORMAT(
        DATE_SUB(
          DATE(DATE_ADD(f.first_seen, INTERVAL ${tzOffsetMinutes} MINUTE)),
          INTERVAL WEEKDAY(DATE_ADD(f.first_seen, INTERVAL ${tzOffsetMinutes} MINUTE)) DAY
        ),
        '%Y-%m-%d'
      ) AS cohort_start,
      FLOOR(TIMESTAMPDIFF(DAY, f.first_seen, e.created_at) / 7) AS week_index,
      COUNT(DISTINCT f.pv) AS visitors
    FROM firsts f
    JOIN analytics_events e
      ON e.user_id = ${userId} AND e.type = 'view' AND e.persistent_visitor = f.pv
    GROUP BY cohort_start, week_index
  `;

  const cohorts = new Map<string, Map<number, number>>();
  for (const row of rows) {
    const key = String(row.cohort_start);
    const week = toNumber(row.week_index);
    if (!cohorts.has(key)) cohorts.set(key, new Map());
    cohorts.get(key)!.set(week, toNumber(row.visitors));
  }

  const now = Date.now();
  return [...cohorts.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([cohortStart, weekMap]) => {
      const size = weekMap.get(0) ?? 0;
      const cohortEnd = new Date(`${cohortStart}T00:00:00Z`).getTime() + 7 * DAY_MS;
      const weeks = Array.from({ length: RETENTION_WEEKS - 1 }, (_, i) => {
        const week = i + 1;
        // Only report a week once every member of the cohort could have reached it
        if (cohortEnd + (week + 1) * 7 * DAY_MS > now) return null;
        const returned = weekMap.get(week) ?? 0;
        return { week, returned, rate: size > 0 ? returned / size : 0 };
      });
      return { cohortStart, size, weeks };
    });
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export type CampaignPerformance = {
  id: number;
  name: string;
  slug: string;
  channel: string;
  createdAt: Date;
  archived: boolean;
  views: number;
  visitors: number;
  clicks: number;
  clickers: number;
};

export async function getCampaignPerformance(
  userId: number,
  from: Date,
  to: Date
): Promise<CampaignPerformance[]> {
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      c.id, c.name, c.slug, c.channel, c.created_at, c.archived_at,
      SUM(e.type = 'view') AS views,
      COUNT(DISTINCT CASE WHEN e.type = 'view' THEN e.visitor_hash END) AS visitors,
      SUM(e.type = 'click') AS clicks,
      COUNT(DISTINCT CASE WHEN e.type = 'click' THEN e.visitor_hash END) AS clickers
    FROM analytics_campaigns c
    LEFT JOIN analytics_events e
      ON e.campaign_id = c.id AND e.created_at >= ${from} AND e.created_at < ${to}
    WHERE c.user_id = ${userId}
    GROUP BY c.id, c.name, c.slug, c.channel, c.created_at, c.archived_at
    ORDER BY (c.archived_at IS NULL) DESC, c.created_at DESC
  `;
  return rows.map(row => ({
    id: toNumber(row.id),
    name: String(row.name),
    slug: String(row.slug),
    channel: String(row.channel),
    createdAt: row.created_at as Date,
    archived: row.archived_at !== null,
    views: toNumber(row.views),
    visitors: toNumber(row.visitors),
    clicks: toNumber(row.clicks),
    clickers: toNumber(row.clickers),
  }));
}

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

export async function getLatestEventAt(userId: number): Promise<Date | null> {
  const latest = await prisma.analyticsEvent.findFirst({
    where: { user_id: userId, type: { in: ["view", "click"] } },
    orderBy: { created_at: "desc" },
    select: { created_at: true },
  });
  return latest?.created_at ?? null;
}
