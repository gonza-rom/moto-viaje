// Service worker de "Mis viajes".
// - Archivos estáticos de Next (con hash) e íconos: cache-first.
// - Páginas: siempre de la red (los datos son privados y cambian); si no hay señal, página offline.
// - Fotos de Cloudinary: cache-first con tope, para ver viajes ya abiertos en zonas sin señal.

const VERSION = "v1";
const ESTATICOS = `estaticos-${VERSION}`;
const FOTOS = `fotos-${VERSION}`;
const MAX_FOTOS = 300;
const OFFLINE = "/offline.html";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(ESTATICOS)
      .then((c) => c.addAll([OFFLINE, "/icons/icon-192.png", "/icons/icon-512.png"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![ESTATICOS, FOTOS].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function recortar(nombre, max) {
  const c = await caches.open(nombre);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function cacheFirst(req, nombre, max) {
  const c = await caches.open(nombre);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") {
    c.put(req, res.clone());
    if (max) recortar(nombre, max);
  }
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Navegación: red, y si falla, página offline
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
      e.respondWith(cacheFirst(req, ESTATICOS));
    }
    return;
  }

  // Imágenes de Cloudinary (no videos: pesan demasiado)
  if (url.hostname === "res.cloudinary.com" && url.pathname.includes("/image/upload/")) {
    e.respondWith(cacheFirst(req, FOTOS, MAX_FOTOS));
  }
});
