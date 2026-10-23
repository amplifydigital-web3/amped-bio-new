import { render } from "@react-email/render";
import { prisma } from "@repo/database";
import {
  RNS_CHAIN,
  RNS_GRACE_PERIOD_SECONDS,
  formatRnsName,
  rnsExpiryFromGraceEnd,
} from "@repo/web3";
import { env } from "../../env";
import { deliverEmail } from "../../utils/email/transport";
import { uuidv7 } from "../../utils/uuid-v7";
import RnsExpiryTemplate from "../../utils/email/RnsExpiryTemplate";
import { rnsDaysLeft, rnsExpiryStage, rnsExpirySubject, type RnsExpiryStage } from "./stage";

export { rnsExpiryStage, rnsDaysLeft, rnsExpirySubject } from "./stage";

const DAY = 86_400;
const SWEEP_MS = 60 * 60 * 1000;
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;
/** A notice is abandoned after this many failed sends. */
const MAX_ATTEMPTS = 3;
/** Hours to wait before the next try: 1 after the first failure, 2 after the second. */
const BACKOFF_HOURS = [1, 2, 4];

export type ExpiringName = { label: string; owner: string; expiry: number };

/** The subgraph answer. A GraphQL error comes with HTTP 200 and no data. */
type SubgraphAnswer = {
  data?: {
    revoNames?: { labelName: string | null; owner: string; expiryDateWithGrace: string }[];
  };
  errors?: { message?: string }[];
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const formatDate = (seconds: number) => DATE_FORMAT.format(new Date(seconds * 1000));

/**
 * Every RNS name whose grace end is still ahead and whose registration expiry
 * is at most 30 days out, from the RNS subgraph. One windowed query covers
 * every owner; it pages until a short page comes back.
 */
export async function fetchExpiringNames(
  now: number,
  fetcher: typeof fetch = fetch
): Promise<ExpiringName[] | null> {
  if (!env.SUBGRAPH_URL) {
    console.warn("[rns-expiry] the subgraph URL is not set, no names to sweep");
    return null;
  }
  const from = now;
  const to = now + 30 * DAY + RNS_GRACE_PERIOD_SECONDS;
  const names: ExpiringName[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await fetcher(env.SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        query: `query ($from: BigInt!, $to: BigInt!, $skip: Int!) { revoNames(first: ${PAGE_SIZE}, skip: $skip, orderBy: expiryDateWithGrace, where: { name_not: null, expiryDateWithGrace_gt: $from, expiryDateWithGrace_lte: $to }) { labelName owner expiryDateWithGrace } }`,
        variables: { from: String(from), to: String(to), skip: page * PAGE_SIZE },
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(`[rns-expiry] the subgraph answered with ${res.status}`, body.slice(0, 500));
      return null;
    }
    let json: SubgraphAnswer;
    try {
      json = JSON.parse(body) as SubgraphAnswer;
    } catch {
      console.error("[rns-expiry] the subgraph answer was not JSON", body.slice(0, 500));
      return null;
    }
    // A GraphQL error comes back with HTTP 200 and no data
    if (json.errors?.length) {
      console.error("[rns-expiry] the subgraph returned errors", json.errors);
      return null;
    }
    const rows = json.data?.revoNames;
    if (!Array.isArray(rows)) {
      console.error("[rns-expiry] the subgraph answer had no revoNames list", body.slice(0, 500));
      return null;
    }
    for (const row of rows) {
      if (!row.labelName || !row.owner) continue;
      names.push({
        label: row.labelName,
        owner: row.owner.toLowerCase(),
        expiry: rnsExpiryFromGraceEnd(row.expiryDateWithGrace),
      });
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return names;
}

type Recipient = { userId: number; email: string; name: string };

/**
 * Wallet owners who get reminders: a linked Amped.Bio wallet, a verified
 * email (Rob, 23 Oct: verified addresses only) and reminders not turned off.
 */
async function recipientsFor(owners: string[]): Promise<Map<string, Recipient>> {
  const map = new Map<string, Recipient>();
  if (!owners.length) return map;
  const wallets = await prisma.userWallet.findMany({
    where: { address: { in: owners } },
    select: {
      address: true,
      user: {
        select: {
          id: true,
          email: true,
          email_verified: true,
          name: true,
          notificationPreferences: {
            where: { creatorUserId: 0 },
            select: { rnsRemindersEnabled: true },
          },
        },
      },
    },
  });
  for (const wallet of wallets) {
    const { user } = wallet;
    if (!user.email || !user.email_verified) continue;
    if (user.notificationPreferences[0]?.rnsRemindersEnabled === false) continue;
    map.set(wallet.address.toLowerCase(), { userId: user.id, email: user.email, name: user.name });
  }
  return map;
}

/**
 * Records the notice first so two servers never both send it. True when this
 * server owns the notice and may send it.
 *
 * A notice that already went is skipped for good. A notice whose send failed
 * is taken over again, after a backoff, until MAX_ATTEMPTS tries.
 */
async function claimNotice(
  userId: number,
  label: string,
  expiry: number,
  stage: RnsExpiryStage,
  now: number
): Promise<boolean> {
  try {
    await prisma.rnsExpiryNotice.create({
      data: { id: uuidv7(), userId, label, expiry, stage, attempts: 1 },
    });
    return true;
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
  }
  // The notice exists: it went out, it is abandoned, or it waits for its turn.
  const row = await prisma.rnsExpiryNotice.findUnique({
    where: { userId_label_expiry_stage: { userId, label, expiry, stage } },
    select: { attempts: true, failedAt: true },
  });
  // Only a notice whose last attempt failed can be taken over. A notice in
  // flight belongs to the server that wrote it.
  if (!row?.failedAt) return false;
  if (row.attempts >= MAX_ATTEMPTS) return false;
  const wait = BACKOFF_HOURS[Math.min(row.attempts, BACKOFF_HOURS.length) - 1] * 3600;
  if (row.failedAt.getTime() + wait * 1000 > now * 1000) return false;
  // Take the notice over. The compare and swap on attempts lets only one
  // server win, so a reminder never goes out twice.
  const taken = await prisma.rnsExpiryNotice.updateMany({
    where: { userId, label, expiry, stage, attempts: row.attempts, failedAt: { not: null } },
    data: { attempts: { increment: 1 }, failedAt: null },
  });
  return taken.count === 1;
}

/**
 * The send failed: the notice waits for its backoff, or is abandoned when it
 * used up its attempts. Returns the attempts made, or null when the row is gone.
 */
async function markFailed(
  userId: number,
  label: string,
  expiry: number,
  stage: RnsExpiryStage,
  now: number
): Promise<number | null> {
  const row = await prisma.rnsExpiryNotice
    .update({
      where: { userId_label_expiry_stage: { userId, label, expiry, stage } },
      data: { failedAt: new Date(now * 1000) },
      select: { attempts: true },
    })
    .catch(() => null);
  return row?.attempts ?? null;
}

export function extendUrl(label: string) {
  const url = new URL("/wallet", env.APP_URL);
  url.searchParams.set("tab", "rns");
  url.searchParams.set("name", label);
  url.searchParams.set("flow", "extend");
  return url.toString();
}

export async function sendRnsExpiryEmail(
  to: Recipient,
  name: ExpiringName,
  stage: RnsExpiryStage,
  now: number
) {
  const fullName = formatRnsName(name.label, RNS_CHAIN.id);
  const html = await render(
    RnsExpiryTemplate({
      name: fullName,
      firstName: to.name?.split(" ")[0] || undefined,
      grace: stage === "grace",
      daysLeft: rnsDaysLeft(name.expiry, now),
      expiryDate: formatDate(name.expiry),
      releaseDate: formatDate(name.expiry + RNS_GRACE_PERIOD_SECONDS),
      extendUrl: extendUrl(name.label),
      settingsUrl: new URL("/account?open=reminders", env.APP_URL).toString(),
      privacyUrl: new URL("/privacy", env.LANDINGPAGE_URL).toString(),
    })
  );
  await deliverEmail({
    to: [to.email],
    subject: rnsExpirySubject(fullName, stage, name.expiry, now),
    html,
  });
}

/** One sweep: find names in a reminder stage, send each reminder once. Returns emails sent. */
export async function sweepRnsExpiry(now = Math.floor(Date.now() / 1000)): Promise<number> {
  const names = await fetchExpiringNames(now);
  if (!names) {
    console.warn("[rns-expiry] the subgraph read failed, no reminders sent");
    return 0;
  }
  if (!names.length) {
    console.warn("[rns-expiry] the subgraph returned no name in the expiry window");
    return 0;
  }
  const due = names
    .map(name => ({ name, stage: rnsExpiryStage(name.expiry, now) }))
    .filter((item): item is { name: ExpiringName; stage: RnsExpiryStage } => !!item.stage);
  if (!due.length) {
    console.warn(`[rns-expiry] ${names.length} name(s) in the window, none in a reminder stage`);
    return 0;
  }

  const recipients = await recipientsFor([...new Set(due.map(item => item.name.owner))]);
  let sent = 0;
  for (const { name, stage } of due) {
    const to = recipients.get(name.owner);
    if (!to) continue;
    let claimed = false;
    try {
      claimed = await claimNotice(to.userId, name.label, name.expiry, stage, now);
      if (!claimed) continue;
      await sendRnsExpiryEmail(to, name, stage, now);
      sent += 1;
    } catch (error) {
      // One bad name or one bad row must not take down the whole sweep
      console.error(`[rns-expiry] the reminder failed for user ${to.userId}, ${name.label}`, error);
      if (!claimed) continue;
      const attempts = await markFailed(to.userId, name.label, name.expiry, stage, now);
      if (attempts !== null && attempts >= MAX_ATTEMPTS) {
        console.error(
          `[rns-expiry] gave up on ${name.label} for user ${to.userId} after ${attempts} attempts`
        );
      }
    }
  }
  if (sent) console.log(`[rns-expiry] sent ${sent} reminder email(s)`);
  return sent;
}

let sweeper: NodeJS.Timeout | null = null;
/** Hourly. The notice table keeps each reminder to one email. */
export function startRnsExpirySweeper() {
  // No subgraph means no names to sweep: the timer never starts
  if (sweeper || process.env.NODE_ENV === "test" || !env.RNS_EXPIRY_EMAILS || !env.SUBGRAPH_URL) {
    return;
  }
  const run = () =>
    void sweepRnsExpiry().catch(error => console.error("[rns-expiry] sweep failed", error));
  setTimeout(run, 60_000);
  sweeper = setInterval(run, SWEEP_MS);
  sweeper.unref();
}
