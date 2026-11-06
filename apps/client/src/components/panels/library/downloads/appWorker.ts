/**
 * The installable app (Build Board #26, FL-5, spec 3.5 Offline). One service
 * worker for the app, public/sw.js, shared with Amped Messages push. FL-5
 * registers it while the fanLibrary flag is on and tells it whether to keep
 * the app shell; off, the worker drops both caches and passes every request
 * through, so the flag is the kill switch.
 *
 * Builds only: a dev server never gets a worker, so a stale shell never hides
 * a code change.
 */

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

let installPrompt: InstallPrompt | null = null;
const installListeners = new Set<() => void>();

function workerSupported() {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator && !import.meta.env.DEV;
}

/** Turns the offline shell on or off. Never throws. */
export async function setAppOffline(enabled: boolean): Promise<void> {
  if (!workerSupported()) return;
  try {
    const registration = enabled
      ? await navigator.serviceWorker.register("/sw.js", { scope: "/" })
      : await navigator.serviceWorker.getRegistration("/");
    if (!registration) return;
    const ready = enabled ? await navigator.serviceWorker.ready : registration;
    const worker = ready.active ?? ready.waiting ?? ready.installing;
    worker?.postMessage({ type: "amped-offline", enabled });
  } catch (error) {
    console.warn("[offline] service worker not available", error);
  }
}

/** Keeps the browser's install prompt for the Install button (Chrome, Edge, Android). */
export function watchInstallPrompt() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event as InstallPrompt;
    installListeners.forEach(listener => listener());
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    installListeners.forEach(listener => listener());
  });
}

export function canPromptInstall() {
  return installPrompt !== null;
}

export function onInstallChange(listener: () => void) {
  installListeners.add(listener);
  return () => {
    installListeners.delete(listener);
  };
}

/** Shows the browser's install prompt. True when the fan installed. */
export async function promptInstall(): Promise<boolean> {
  const prompt = installPrompt;
  if (!prompt) return false;
  installPrompt = null;
  installListeners.forEach(listener => listener());
  await prompt.prompt();
  const choice = await prompt.userChoice;
  return choice.outcome === "accepted";
}

/** True when the app runs from the home screen. */
export function runningInstalled() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone and iPad Safari: no install prompt, the Share sheet instead. */
export function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}
