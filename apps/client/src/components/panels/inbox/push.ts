import { trpcClient } from "@repo/ui";

/**
 * Web Push on this device (PR M5 client for M4, spec 7.4 item 2 and 8.3). The service
 * worker is push only (apps/client/public/sw.js). Permission is asked only from a tap.
 */
export type PushState = "unsupported" | "blocked" | "on" | "off";

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** iPhone and iPad Safari outside a Home Screen app: push needs the app installed. */
export function needsIosInstall() {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

function keyBytes(base64: string) {
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "off";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

async function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
  await trpcClient.push.subscribe.mutate({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    userAgent: navigator.userAgent.slice(0, 255),
  });
}

/** Ask, subscribe and save. Must run from a tap: browsers refuse the ask otherwise. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const { key } = await trpcClient.push.publicKey.query();
  if (!key) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "blocked";
  if (permission !== "granted") return "off";
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(key),
    }));
  await saveSubscription(sub);
  await trpcClient.notifications.setMessagePrefs.mutate({ push: true });
  return "on";
}

export async function disablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await trpcClient.push.unsubscribe.mutate({ endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  }
  return pushState();
}

/**
 * On sign in: keep an allowed device's subscription saved to this account (it may have
 * rotated, or the device may have been used by someone else). Never asks.
 */
export async function refreshPushSubscription() {
  try {
    if (!pushSupported() || Notification.permission !== "granted") return;
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    if (sub) await saveSubscription(sub);
  } catch {
    // A refresh is best effort
  }
}

const ASKED_KEY = "amped:push-asked";
/** The in Inbox ask shows once per device, after the first message sent. */
export function pushAskDue() {
  try {
    return (
      pushSupported() &&
      !needsIosInstall() &&
      Notification.permission === "default" &&
      localStorage.getItem(ASKED_KEY) !== "1"
    );
  } catch {
    return false;
  }
}
export function markPushAsked() {
  try {
    localStorage.setItem(ASKED_KEY, "1");
  } catch {
    // Private mode: the ask may show again, which is harmless
  }
}
