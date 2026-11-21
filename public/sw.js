// Zambak Danışmanlık – bildirim service worker
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let v = {};
  try { v = e.data ? e.data.json() : {}; } catch { v = { govde: e.data && e.data.text() }; }
  const baslik = v.baslik || "Zambak Danışmanlık";
  e.waitUntil(self.registration.showNotification(baslik, {
    body: v.govde || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: v.etiket || undefined,
    renotify: !!v.etiket,
    data: { url: v.url || "/" },
    lang: "tr",
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const hedef = new URL(e.notification.data && e.notification.data.url ? e.notification.data.url : "/", self.location.origin).href;
  e.waitUntil((async () => {
    const pencereler = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const yol = new URL(hedef).pathname;
    for (const p of pencereler) {
      if (new URL(p.url).pathname === yol && "focus" in p) {
        await p.focus();
        p.postMessage({ tip: "git", url: hedef });
        return;
      }
    }
    await self.clients.openWindow(hedef);
  })());
});
