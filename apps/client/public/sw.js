/*
 * Amped.Bio service worker.
 *
 * - Amped Messages (Build Board #2 r4, PR M4, spec 7.4 item 2): Web Push.
 * - Fan Library FL-5 (Build Board #26, spec 3.5 Offline): the installable app's
 *   shell and the fan's offline downloads.
 *
 * What it caches (spec 3.5): the app shell (index.html, the built /assets files,
 * icons and the manifest) and /downloads/{publicId} only. Never API responses,
 * signed media URLs, streams in progress or creator pages: every request to
 * another origin, and every same origin request that is not listed here, goes
 * to the network untouched.
 *
 * The shell is cached only while the app says offline is on (the fanLibrary
 * flag), by posting {type: "amped-offline", enabled}. Off clears both caches,
 * so turning the flag off in admin puts every app back to network only.
 */

const SHELL_CACHE = "amped-shell-v1";
const DOWNLOADS_CACHE = "amped-downloads-v1";
const CONFIG_CACHE = "amped-config-v1";
const CONFIG_KEY = "/__amped/offline";
const SHELL_KEY = "/__amped/shell";
// Built files are hashed, so an entry never changes; the oldest go past this many
const SHELL_MAX_ENTRIES = 400;

/** A same origin answer that is safe to keep: not opaque, not a redirect. */
function keepable(response) {
  return response.ok && !response.redirected && (response.type === "basic" || response.type === "default");
}

// Known after the first read; a restarted worker reads the config cache again
let enabledNow = null;

async function offlineEnabled() {
  if (enabledNow !== null) return enabledNow;
  const cache = await caches.open(CONFIG_CACHE);
  const hit = await cache.match(CONFIG_KEY);
  try {
    enabledNow = hit ? (await hit.json()).enabled === true : false;
  } catch {
    enabledNow = false;
  }
  return enabledNow;
}

async function setOffline(enabled) {
  enabledNow = enabled;
  const cache = await caches.open(CONFIG_CACHE);
  await cache.put(
    CONFIG_KEY,
    new Response(JSON.stringify({ enabled }), { headers: { "Content-Type": "application/json" } })
  );
  if (!enabled) {
    await caches.delete(SHELL_CACHE);
    await caches.delete(DOWNLOADS_CACHE);
  }
}

self.addEventListener("message", event => {
  const data = event.data || {};
  if (data.type === "amped-offline") event.waitUntil(setOffline(data.enabled === true));
});

/** Paths the shell keeps: built files, icons, the manifest. */
function isShellFile(url) {
  return (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.png"
  );
}

async function trimShell(cache) {
  const keys = await cache.keys();
  const extra = keys.length - SHELL_MAX_ENTRIES;
  for (let i = 0; i < extra; i++) {
    if (new URL(keys[i].url).pathname !== SHELL_KEY) await cache.delete(keys[i]);
  }
}

/** Built files: the cache first, else the network, kept for next time. */
async function shellFile(request) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (keepable(response)) {
    await cache.put(request, response.clone());
    await trimShell(cache);
  }
  return response;
}

/** Pages: the network first (so a deploy shows at once), else the last index.html. */
async function navigation(request) {
  try {
    const response = await fetch(request);
    const type = response.headers.get("Content-Type") || "";
    if (keepable(response) && type.includes("text/html")) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(SHELL_KEY, response.clone());
    }
    return response;
  } catch (error) {
    const cache = await caches.open(SHELL_CACHE);
    const shell = await cache.match(SHELL_KEY);
    if (shell) return shell;
    throw error;
  }
}

/**
 * An offline copy. Media elements ask for byte ranges, and Safari plays only
 * from a 206, so a Range request gets the slice it names.
 */
async function download(request, url) {
  const cache = await caches.open(DOWNLOADS_CACHE);
  const hit = await cache.match(url.pathname);
  if (!hit) return new Response("Not on this device", { status: 404 });
  const range = request.headers.get("Range");
  const type = hit.headers.get("Content-Type") || "application/octet-stream";
  const base = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const blob = await hit.blob();
  const match = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) {
    return new Response(blob, { status: 200, headers: { ...base, "Content-Length": String(blob.size) } });
  }
  let start = match[1] === "" ? NaN : Number(match[1]);
  let end = match[2] === "" ? NaN : Number(match[2]);
  if (Number.isNaN(start)) {
    // bytes=-N: the last N bytes
    start = Math.max(0, blob.size - end);
    end = blob.size - 1;
  } else if (Number.isNaN(end) || end >= blob.size) {
    end = blob.size - 1;
  }
  if (start > end || start >= blob.size) {
    return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${blob.size}` } });
  }
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      ...base,
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${blob.size}`,
    },
  });
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Offline copies answer even with the shell off: they exist only while it was on
  if (url.pathname.startsWith("/downloads/")) {
    event.respondWith(download(request, url));
    return;
  }

  // Offline off: the request goes to the network as if no worker were here
  if (enabledNow === false) return;
  event.respondWith(
    offlineEnabled().then(enabled => {
      if (!enabled) return fetch(request);
      if (request.mode === "navigate") return navigation(request);
      if (isShellFile(url)) return shellFile(request);
      return fetch(request);
    })
  );
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("push", event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Amped.Bio";
  const body = typeof data.body === "string" && data.body ? data.body : "You have a new message";
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/inbox";
  const tag = typeof data.tag === "string" ? data.tag : undefined;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => {
      // An open, focused app already shows the message live: no system notification
      if (windows.some(w => w.focused && w.visibilityState === "visible")) return undefined;
      return self.registration.showNotification(title, {
        body,
        tag,
        renotify: !!tag,
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        data: { url },
      });
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || "/inbox",
    self.location.origin
  ).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => {
      const open = windows.find(w => new URL(w.url).origin === self.location.origin);
      if (open) {
        return open.focus().then(w => (w && "navigate" in w ? w.navigate(target) : undefined));
      }
      return self.clients.openWindow(target);
    })
  );
});

// The browser rotated the subscription: tell the app on its next open (M5 resubscribes)
self.addEventListener("pushsubscriptionchange", () => undefined);
