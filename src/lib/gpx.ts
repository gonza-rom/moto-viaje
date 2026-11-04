export type Punto = [number, number]; // [lat, lon]

/** Parsea GPX (tracks y rutas). Solo navegador (usa DOMParser). */
export function parseGpx(xml: string): Punto[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  let nodes = Array.from(doc.getElementsByTagName("trkpt"));
  if (!nodes.length) nodes = Array.from(doc.getElementsByTagName("rtept"));
  return nodes
    .map((n) => [parseFloat(n.getAttribute("lat") || ""), parseFloat(n.getAttribute("lon") || "")] as Punto)
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
}

function haversine([lat1, lon1]: Punto, [lat2, lon2]: Punto): number {
  const R = 6371; // km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function distanciaKm(puntos: Punto[]): number {
  let total = 0;
  for (let i = 1; i < puntos.length; i++) total += haversine(puntos[i - 1], puntos[i]);
  return Math.round(total * 10) / 10;
}
