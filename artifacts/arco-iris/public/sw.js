// Service worker mínimo para o NFs ser instalável como aplicativo.
// Não guarda nada em cache: tudo continua vindo da internet como hoje.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
