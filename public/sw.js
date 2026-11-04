// Service worker de "Mis viajes".
// - Archivos estáticos de Next (con hash) e íconos: cache-first.
// - Páginas: primero la red (los datos cambian); se guarda la última versión de cada página visitada
//   para poder abrir la app sin señal (y cargar un viaje nuevo en la ruta). Si no hay copia: página offline.
// - Fotos de Cloudinary: cache-first con tope, para ver viajes ya abiertos en zonas sin señal.

const VERSION = "v2";
const ESTATICOS = `estaticos-${VERSION}`;
const FOTOS = `fotos-${VERSION}`;
const PAGINAS = "paginas"; // se borra al cerrar sesión
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
      .then((keys) => Promise.all(keys.filter((k) => ![ESTATICOS, FOTOS, PAGINAS].includes(k)).map((k) => caches.delete(k))))
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

  // Navegación: red (guardando copia); sin señal, la última copia de esa página o la página offline
  if (req.mode === "navigate") {
    const p = url.pathname;
    const guardable =
      url.origin === self.location.origin && !p.startsWith("/login") && !p.startsWith("/c/") && !p.startsWith("/api/");
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (guardable && res.ok && !res.redirected) {
            const copia = res.clone();
            caches.open(PAGINAS).then((c) => c.put(url.pathname, copia));
          }
          return res;
        })
        .catch(async () => (await caches.match(url.pathname)) || (await caches.match(OFFLINE)))
    );
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

// Al cerrar sesión la app pide borrar las páginas guardadas (tienen datos privados)
self.addEventListener("message", (e) => {
  if (e.data === "cerrar-sesion") e.waitUntil(caches.delete(PAGINAS));
  // La app pide guardar las páginas principales para que abran sin señal aunque no se hayan visitado.
  // Si no hay sesión, el servidor redirige a /login y no se guarda nada.
  if (e.data?.tipo === "precachear" && Array.isArray(e.data.urls)) {
    e.waitUntil(
      caches.open(PAGINAS).then((c) =>
        Promise.all(
          e.data.urls.map((u) =>
            fetch(u, { credentials: "same-origin" })
              .then((res) => (res.ok && !res.redirected ? c.put(new URL(u, self.location.origin).pathname, res) : null))
              .catch(() => null)
          )
        )
      )
    );
  }
});
