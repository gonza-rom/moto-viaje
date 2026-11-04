import { distanciaKm, type Punto } from "./gpx";

/** Ruta trazada a mano en el mapa (se guarda como jsonb en viajes.ruta) */
export type Parada = { lat: number; lng: number; nombre?: string };
export type ModoRuta = "calle" | "recta";
export type Ruta = { modo: ModoRuta; paradas: Parada[]; trazo: Punto[]; km: number };

export const MAX_PARADAS = 25;

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

/** Douglas-Peucker iterativo. tol en grados (~0.00005 ≈ 5 m) */
export function simplificar(puntos: Punto[], tol = 0.00005): Punto[] {
  if (puntos.length < 3) return puntos;
  const keep = new Uint8Array(puntos.length);
  keep[0] = keep[puntos.length - 1] = 1;
  const pila: [number, number][] = [[0, puntos.length - 1]];
  const t2 = tol * tol;
  while (pila.length) {
    const [a, b] = pila.pop()!;
    const [ay, ax] = puntos[a];
    const [by, bx] = puntos[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let max = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [py, px] = puntos[i];
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (idx !== -1 && max > t2) {
      keep[idx] = 1;
      pila.push([a, idx], [idx, b]);
    }
  }
  return puntos.filter((_, i) => keep[i]);
}

/** Calcula el trazo: siguiendo calles (OSRM) o en línea recta entre paradas */
export async function trazarRuta(paradas: Parada[], modo: ModoRuta, signal?: AbortSignal): Promise<Ruta> {
  if (paradas.length < 2) return { modo, paradas, trazo: [], km: 0 };

  if (modo === "recta") {
    const trazo = paradas.map((p) => [p.lat, p.lng] as Punto);
    return { modo, paradas, trazo, km: distanciaKm(trazo) };
  }

  // Servidor demo público de OSRM: gratis, sin API key, uso liviano.
  const coords = paradas.map((p) => `${p.lng},${p.lat}`).join(";");
  const r = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
    { signal }
  );
  const data = await r.json().catch(() => null);
  if (!r.ok || data?.code !== "Ok" || !data.routes?.length) {
    throw new Error(data?.message || "No se encontró un camino entre esos puntos");
  }
  const ruta = data.routes[0];
  const trazo = simplificar(
    (ruta.geometry.coordinates as [number, number][]).map(([lng, lat]) => [r5(lat), r5(lng)] as Punto)
  );
  return { modo, paradas, trazo, km: Math.round(ruta.distance / 100) / 10 };
}

/** Busca un lugar por nombre (Nominatim / OpenStreetMap). Un request por búsqueda. */
export async function buscarLugar(q: string, signal?: AbortSignal): Promise<Parada | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=es&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error("No se pudo buscar el lugar");
  const [res] = (await r.json()) as { lat: string; lon: string; name?: string; display_name: string }[];
  if (!res) return null;
  return { lat: r5(+res.lat), lng: r5(+res.lon), nombre: res.name || res.display_name.split(",")[0] };
}

/** Link a Google Maps con las mismas paradas, para volver a hacer el viaje */
export function linkGoogleMaps(paradas: Parada[]) {
  if (paradas.length < 2) return null;
  const f = (p: Parada) => `${p.lat},${p.lng}`;
  const medio = paradas.slice(1, -1).map(f).join("|");
  const u = new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api", "1");
  u.searchParams.set("origin", f(paradas[0]));
  u.searchParams.set("destination", f(paradas[paradas.length - 1]));
  if (medio) u.searchParams.set("waypoints", medio);
  u.searchParams.set("travelmode", "driving");
  return u.toString();
}

/** Valida/sanea lo que llega del formulario (servidor) */
export function parseRuta(raw: unknown): Ruta | null {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!v || !Array.isArray(v.paradas) || !Array.isArray(v.trazo)) return null;
    const num = (n: unknown) => typeof n === "number" && Number.isFinite(n);
    const paradas: Parada[] = v.paradas
      .filter((p: Parada) => num(p?.lat) && num(p?.lng))
      .slice(0, MAX_PARADAS)
      .map((p: Parada) => ({
        lat: r5(p.lat),
        lng: r5(p.lng),
        ...(typeof p.nombre === "string" && p.nombre ? { nombre: p.nombre.slice(0, 120) } : {}),
      }));
    const trazo: Punto[] = v.trazo
      .filter((p: unknown) => Array.isArray(p) && num(p[0]) && num(p[1]))
      .slice(0, 20000)
      .map((p: Punto) => [r5(p[0]), r5(p[1])]);
    if (paradas.length < 2 || trazo.length < 2) return null;
    return { modo: v.modo === "recta" ? "recta" : "calle", paradas, trazo, km: num(v.km) ? v.km : distanciaKm(trazo) };
  } catch {
    return null;
  }
}
