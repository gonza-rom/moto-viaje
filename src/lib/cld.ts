// URLs de Cloudinary seguras para cliente y servidor.
const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const BASE = `https://res.cloudinary.com/${CLOUD}`;

export type TipoMedio = "image" | "video";

type Opts = { w?: number; h?: number; crop?: "fill" | "limit"; dpr?: boolean };

function transformaciones({ w, h, crop = "limit", dpr = true }: Opts) {
  const t = ["f_auto", "q_auto"];
  if (dpr) t.push("dpr_auto");
  t.push(`c_${crop}`);
  if (crop === "fill") t.push("g_auto");
  if (w) t.push(`w_${w}`);
  if (h) t.push(`h_${h}`);
  return t;
}

export function cldUrl(publicId: string, opts: Opts = {}) {
  return `${BASE}/image/upload/${transformaciones(opts).join(",")}/${publicId}`;
}

/** srcSet responsive sin recorte, para que el navegador elija el tamaño */
export function cldSrcSet(publicId: string, widths = [480, 800, 1200, 1600, 2400]) {
  return widths.map((w) => `${cldUrl(publicId, { w, dpr: false })} ${w}w`).join(", ");
}

/** Fotograma de un video como imagen (Cloudinary elige el mejor cuadro) */
export function cldPoster(publicId: string, opts: Opts = {}) {
  return `${BASE}/video/upload/so_auto,${transformaciones(opts).join(",")}/${publicId}.jpg`;
}

/** Video optimizado (codec/calidad automáticos, máx. `w` px de ancho) */
export function cldVideo(publicId: string, w = 1280) {
  return `${BASE}/video/upload/f_auto:video,q_auto,c_limit,w_${w}/${publicId}`;
}

/** Imagen para mostrar de cualquier medio: la foto o el fotograma del video */
export function cldMiniatura(m: { tipo?: TipoMedio | null; public_id: string }, opts: Opts = {}) {
  return m.tipo === "video" ? cldPoster(m.public_id, opts) : cldUrl(m.public_id, opts);
}

export function cldOriginal(m: { tipo?: TipoMedio | null; public_id: string }) {
  return `${BASE}/${m.tipo === "video" ? "video" : "image"}/upload/fl_attachment/${m.public_id}`;
}

export function duracionTxt(seg: number | null | undefined) {
  if (!seg) return "";
  const s = Math.round(seg);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
