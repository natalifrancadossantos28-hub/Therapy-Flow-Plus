// Service worker do NFs: deixa o sistema instalável e recebe os avisos da Agenda da Cláudia.
// Não guarda nada em cache: tudo continua vindo da internet como hoje.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "NFs Gestão", {
    body: d.body || "",
    tag: d.tag || undefined,
    renotify: Boolean(d.tag),
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: d.url || "/agenda-claudia", ack: d.ack || null },
    actions: d.ack ? [{ action: "visto", title: "Ok, vi" }] : [],
    requireInteraction: d.tag !== "teste",
    vibrate: [200, 100, 200],
  }));
});

function marcarVisto(ack) {
  if (!ack) return Promise.resolve();
  return fetch("/api/agenda/visto", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ack }) }).catch(() => {});
}

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const visto = marcarVisto(e.notification.data?.ack);
  if (e.action === "visto") { e.waitUntil(visto); return; }
  const url = new URL(e.notification.data?.url || "/agenda-claudia", self.location.origin).href;
  e.waitUntil((async () => {
    await visto;
    const abertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of abertas) {
      if (c.url.startsWith(self.location.origin)) { await c.focus(); if ("navigate" in c) await c.navigate(url); return; }
    }
    await self.clients.openWindow(url);
  })());
});
