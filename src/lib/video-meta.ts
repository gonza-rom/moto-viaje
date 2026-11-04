// Fecha y ubicación de videos MP4/MOV (iPhone y Android) leyendo el átomo "moov".
// Solo cliente. Lee por partes, sin cargar el video entero en memoria.

import type { DatosExif } from "./exif";

const p2 = (n: number) => String(n).padStart(2, "0");
const aLocal = (d: Date) =>
  `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;

async function leer(file: File, desde: number, largo: number) {
  return new Uint8Array(await file.slice(desde, desde + largo).arrayBuffer());
}

/** Busca el átomo moov recorriendo los átomos de primer nivel (salta mdat sin leerlo) */
async function buscarMoov(file: File): Promise<Uint8Array | null> {
  let pos = 0;
  for (let i = 0; i < 50 && pos + 8 <= file.size; i++) {
    const h = await leer(file, pos, 16);
    const dv = new DataView(h.buffer);
    let tam = dv.getUint32(0);
    const tipo = String.fromCharCode(h[4], h[5], h[6], h[7]);
    let cab = 8;
    if (tam === 1) {
      tam = Number(dv.getBigUint64(8));
      cab = 16;
    } else if (tam === 0) tam = file.size - pos;
    if (tam < cab) return null;
    if (tipo === "moov") return tam > 64 * 1024 * 1024 ? null : leer(file, pos, tam);
    pos += tam;
  }
  return null;
}

const indice = (buf: Uint8Array, txt: string, desde = 0) => {
  const b = [...txt].map((c) => c.charCodeAt(0));
  outer: for (let i = desde; i <= buf.length - b.length; i++) {
    for (let j = 0; j < b.length; j++) if (buf[i + j] !== b[j]) continue outer;
    return i;
  }
  return -1;
};

/** "+34.6037-058.3816+025.000/" → lat/lng */
function iso6709(s: string) {
  const m = s.match(/([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

const ascii = (buf: Uint8Array, desde: number, largo: number) =>
  String.fromCharCode(...buf.subarray(desde, Math.min(buf.length, desde + largo)));

export async function leerMetaVideo(file: File): Promise<DatosExif> {
  const vacio: DatosExif = { tomada_en: null, lat: null, lng: null };
  try {
    const moov = await buscarMoov(file);
    if (!moov) return vacio;
    let tomada_en: string | null = null;
    let gps: { lat: number; lng: number } | null = null;

    // iPhone: metadatos Apple con hora local y zona ("2024-05-01T10:20:30-0300")
    const iCre = indice(moov, "com.apple.quicktime.creationdate");
    if (iCre >= 0) {
      const m = ascii(moov, iCre, 400).match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
      if (m) tomada_en = m[1];
    }
    const iLoc = indice(moov, "com.apple.quicktime.location.ISO6709");
    if (iLoc >= 0) gps = iso6709(ascii(moov, iLoc + 36, 400));

    // Android y otros: átomo ©xyz con ISO 6709
    if (!gps) {
      const iXyz = indice(moov, "©xyz");
      if (iXyz >= 0) gps = iso6709(ascii(moov, iXyz + 4, 60));
    }

    // Fecha de creación del mvhd (UTC, segundos desde 1904) → hora local del celular
    if (!tomada_en) {
      const iMvhd = indice(moov, "mvhd");
      if (iMvhd >= 0) {
        const dv = new DataView(moov.buffer, moov.byteOffset);
        const version = moov[iMvhd + 4];
        const seg = version === 1 ? Number(dv.getBigUint64(iMvhd + 8)) : dv.getUint32(iMvhd + 8);
        const ms = (seg - 2082844800) * 1000;
        // Descartar fechas vacías o absurdas (algunas apps ponen 0)
        if (ms > Date.UTC(2000, 0, 1) && ms < Date.now() + 86400000) tomada_en = aLocal(new Date(ms));
      }
    }
    return { tomada_en, lat: gps?.lat ?? null, lng: gps?.lng ?? null };
  } catch {
    return vacio;
  }
}
