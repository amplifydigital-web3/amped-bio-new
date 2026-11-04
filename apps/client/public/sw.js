/*
 * Amped.Bio service worker (Amped Messages, Build Board #2 r4, PR M4, spec 7.4 item 2).
 *
 * Push only. It caches nothing and never intercepts a fetch, so the app loads exactly as
 * it does without it. The app registers it after the person allows notifications (M5).
 */

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
