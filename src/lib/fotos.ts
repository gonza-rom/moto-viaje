// Utilidades de fotos compartidas entre servidor y cliente.

type ConFecha = { tomada_en?: string | null };

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-11-03T11:26:45" → "lun 3 nov · 11:26" */
export function fechaHoraFoto(t: string | null | undefined, conHora = true) {
  if (!t) return "";
  const [f, h = ""] = t.split("T");
  const [a, m, d] = f.split("-").map(Number);
  const dia = DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `${dia} ${d} ${MESES[m - 1]}${conHora && h ? ` · ${h.slice(0, 5)}` : ""}`;
}

/** Diferencia en días entre dos fechas "YYYY-MM-DD" */
function difDias(a: string, b: string) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

export type Grupo<T> = { clave: string; titulo: string; subtitulo?: string; items: T[] };

/**
 * Agrupa por día del viaje ("Día 1", "Día 2"…) según la fecha EXIF.
 * Mantiene el orden elegido dentro de cada día. Sin fecha → grupo final.
 * Si todo cae en un solo día (o nada tiene fecha), devuelve un único grupo sin título.
 */
export function agruparPorDia<T extends ConFecha>(items: T[], fechaInicio: string): Grupo<T>[] {
  const mapa = new Map<string, T[]>();
  for (const it of items) {
    const k = it.tomada_en ? it.tomada_en.slice(0, 10) : "sin-fecha";
    mapa.set(k, [...(mapa.get(k) || []), it]);
  }
  const dias = [...mapa.keys()].filter((k) => k !== "sin-fecha").sort();
  if (dias.length < 2) return [{ clave: "todo", titulo: "", items }];

  const grupos: Grupo<T>[] = dias.map((k) => {
    const n = difDias(k, fechaInicio) + 1;
    return {
      clave: k,
      titulo: n >= 1 ? `Día ${n}` : "Antes de salir",
      subtitulo: fechaHoraFoto(`${k}T`, false),
      items: mapa.get(k)!,
    };
  });
  if (mapa.has("sin-fecha")) grupos.push({ clave: "sin-fecha", titulo: "Sin fecha", items: mapa.get("sin-fecha")! });
  return grupos;
}

export const linkMapa = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
