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

export type ExpiringName = { label: string; owner: string; expiry: number };

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
  if (!env.SUBGRAPH_URL) return null;
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
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: {
        revoNames?: { labelName: string | null; owner: string; expiryDateWithGrace: string }[];
      };
    };
    const rows = json.data?.revoNames;
    if (!Array.isArray(rows)) return null;
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

/** Records the notice first so two servers never both send it. False when it already went. */
async function claimNotice(
  userId: number,
  label: string,
  expiry: number,
  stage: RnsExpiryStage
): Promise<boolean> {
  try {
    await prisma.rnsExpiryNotice.create({ data: { id: uuidv7(), userId, label, expiry, stage } });
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return false;
    throw error;
  }
}

/** A failed send frees the notice, so the next sweep tries again. */
async function releaseNotice(userId: number, label: string, expiry: number, stage: RnsExpiryStage) {
  await prisma.rnsExpiryNotice
    .delete({ where: { userId_label_expiry_stage: { userId, label, expiry, stage } } })
    .catch(() => undefined);
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
  if (!names?.length) return 0;
  const due = names
    .map(name => ({ name, stage: rnsExpiryStage(name.expiry, now) }))
    .filter((item): item is { name: ExpiringName; stage: RnsExpiryStage } => !!item.stage);
  if (!due.length) return 0;

  const recipients = await recipientsFor([...new Set(due.map(item => item.name.owner))]);
  let sent = 0;
  for (const { name, stage } of due) {
    const to = recipients.get(name.owner);
    if (!to) continue;
    if (!(await claimNotice(to.userId, name.label, name.expiry, stage))) continue;
    try {
      await sendRnsExpiryEmail(to, name, stage, now);
      sent += 1;
    } catch (error) {
      console.error(`[rns-expiry] email failed for user ${to.userId}, ${name.label}`, error);
      await releaseNotice(to.userId, name.label, name.expiry, stage);
    }
  }
  if (sent) console.log(`[rns-expiry] sent ${sent} reminder email(s)`);
  return sent;
}

let sweeper: NodeJS.Timeout | null = null;
/** Hourly. The notice table keeps each reminder to one email. */
export function startRnsExpirySweeper() {
  if (sweeper || process.env.NODE_ENV === "test" || !env.RNS_EXPIRY_EMAILS) return;
  const run = () =>
    void sweepRnsExpiry().catch(error => console.error("[rns-expiry] sweep failed", error));
  setTimeout(run, 60_000);
  sweeper = setInterval(run, SWEEP_MS);
  sweeper.unref();
}
