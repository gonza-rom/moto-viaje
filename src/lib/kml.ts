// KML / KMZ (Google Earth, Google Mis Mapas, Wikiloc…) → GPX. Solo navegador.
// El KMZ es un ZIP con un .kml adentro: se descomprime con DecompressionStream (sin librerías).

import type { Punto } from "./gpx";

/** Extrae el primer .kml de un KMZ (ZIP) */
async function kmlDeKmz(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer);

  // Fin del directorio central (firma 0x06054b50), buscando desde el final
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("El KMZ no es un ZIP válido");
  const total = dv.getUint16(eocd + 10, true);
  let pos = dv.getUint32(eocd + 16, true);

  const dec = new TextDecoder();
  for (let n = 0; n < total; n++) {
    if (dv.getUint32(pos, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(pos + 10, true);
    const tamComp = dv.getUint32(pos + 20, true);
    const largoNombre = dv.getUint16(pos + 28, true);
    const largoExtra = dv.getUint16(pos + 30, true);
    const largoComent = dv.getUint16(pos + 32, true);
    const offLocal = dv.getUint32(pos + 42, true);
    const nombre = dec.decode(buf.subarray(pos + 46, pos + 46 + largoNombre));
    pos += 46 + largoNombre + largoExtra + largoComent;
    if (!/\.kml$/i.test(nombre)) continue;

    const ini = offLocal + 30 + dv.getUint16(offLocal + 26, true) + dv.getUint16(offLocal + 28, true);
    const datos = buf.subarray(ini, ini + tamComp);
    if (metodo === 0) return dec.decode(datos);
    if (metodo === 8) {
      const stream = new Blob([datos]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return await new Response(stream).text();
    }
    throw new Error("Compresión del KMZ no soportada");
  }
  throw new Error("El KMZ no tiene un archivo .kml adentro");
}

/** Puntos [lat, lon] de las líneas del KML (LineString y gx:Track) */
export function kmlAPuntos(xml: string): Punto[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const puntos: Punto[] = [];
  const num = (s: string) => parseFloat(s);

  // <LineString><coordinates>lon,lat,alt lon,lat,alt…</coordinates>
  for (const ls of Array.from(doc.getElementsByTagName("LineString"))) {
    const c = ls.getElementsByTagName("coordinates")[0]?.textContent ?? "";
    for (const t of c.trim().split(/\s+/)) {
      const [lon, lat] = t.split(",").map(num);
      if (Number.isFinite(lat) && Number.isFinite(lon)) puntos.push([lat, lon]);
    }
  }
  // <gx:Track><gx:coord>lon lat alt</gx:coord> (grabaciones de Google Earth / apps)
  if (!puntos.length) {
    for (const el of Array.from(doc.getElementsByTagName("gx:coord"))) {
      const [lon, lat] = (el.textContent ?? "").trim().split(/\s+/).map(num);
      if (Number.isFinite(lat) && Number.isFinite(lon)) puntos.push([lat, lon]);
    }
  }
  return puntos;
}

function aGpx(puntos: Punto[], nombre: string) {
  const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
  const pts = puntos.map(([la, lo]) => `<trkpt lat="${la}" lon="${lo}"/>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Mis viajes en moto (desde KML)" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>${esc(nombre)}</name><trkseg>
${pts}
</trkseg></trk>
</gpx>
`;
}

export const esKml = (f: File) => /\.(kml|kmz)$/i.test(f.name);

/** Convierte un .kml o .kmz en un archivo .gpx equivalente */
export async function kmlAGpx(file: File): Promise<File> {
  const xml = /\.kmz$/i.test(file.name) ? await kmlDeKmz(file) : await file.text();
  const puntos = kmlAPuntos(xml);
  if (puntos.length < 2) throw new Error("El archivo no tiene una ruta (línea) con puntos");
  const nombre = file.name.replace(/\.(kml|kmz)$/i, "");
  return new File([aGpx(puntos, nombre)], `${nombre}.gpx`, { type: "application/gpx+xml" });
}
