// Service worker do NFs: deixa o sistema instalável e recebe os avisos da Agenda da Cláudia.
// Só a Minha Agenda funciona sem internet: guarda a tela dela e os arquivos do app; o resto do sistema continua vindo da internet.
const CACHE = "nfs-agenda-v1";
const TELAS = ["/minha-agenda", "/agenda-claudia"];
const ehTelaAgenda = (u) => TELAS.some((t) => u.pathname === t || u.pathname.startsWith(t + "/"));
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.add("/minha-agenda")).catch(() => {}));
});
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("nfs-agenda-") && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    if (!ehTelaAgenda(u)) return;
    // Com internet: sempre a versão nova (e guarda). Sem internet: a última guardada.
    e.respondWith(fetch(req).then((r) => {
      if (r.ok) { const c = r.clone(); void caches.open(CACHE).then((k) => k.put("/minha-agenda", c)); }
      return r;
    }).catch(async () => (await caches.match("/minha-agenda")) || Response.error()));
    return;
  }
  // Arquivos do app (têm nome com versão): usa o guardado, se não tiver busca e guarda.
  if (u.pathname.startsWith("/assets/") || u.pathname.startsWith("/icons/") || u.pathname.endsWith(".webmanifest")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
      if (r.ok) { const c = r.clone(); void caches.open(CACHE).then((k) => k.put(req, c)); }
      return r;
    })));
  }
});

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
    silent: false,
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
