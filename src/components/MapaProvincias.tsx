// Mapa de Argentina con las provincias recorridas pintadas (SVG estático, sin librerías).
// Contornos: IGN vía geoBoundaries (CC BY 3.0 IGO), simplificados en src/data/provincias-ar.json.

import mapa from "@/data/provincias-ar.json";

/** "Provincia de Tucumán" / "tucuman" → "tucuman" */
export const normalizarProvincia = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^provincia (de |del )?/, "")
    .trim();

/** Provincia del mapa que corresponde a un nombre (OpenStreetMap a veces usa nombres largos) */
export function provinciaDelMapa(nombre: string) {
  const n = normalizarProvincia(nombre);
  if (/ciudad (autonoma )?de buenos aires|^caba$|capital federal/.test(n)) return "Ciudad Autónoma de Buenos Aires";
  return mapa.provincias.find((p) => {
    const q = normalizarProvincia(p.nombre);
    return n === q || n.startsWith(`${q},`) || (q === "tierra del fuego" && n.startsWith("tierra del fuego"));
  })?.nombre;
}

export const TOTAL_PROVINCIAS = mapa.provincias.length;

export function MapaProvincias({ visitadas }: { visitadas: string[] }) {
  const set = new Set(visitadas.map(provinciaDelMapa).filter(Boolean) as string[]);
  const total = mapa.provincias.reduce((s, p) => s + p.superficie, 0);
  const recorrida = mapa.provincias.filter((p) => set.has(p.nombre)).reduce((s, p) => s + p.superficie, 0);
  const pct = total ? (recorrida / total) * 100 : 0;
  const caba = mapa.provincias.find((p) => p.nombre === "Ciudad Autónoma de Buenos Aires");

  return (
    <figure className="space-y-2">
      <div className="flex items-baseline gap-3">
        <p className="font-display text-3xl font-bold">
          {set.size} <span className="text-lg text-niebla">de {TOTAL_PROVINCIAS}</span>
        </p>
        <p className="text-sm text-niebla">
          {pct >= 1 ? `${Math.round(pct)} %` : pct > 0 ? "menos del 1 %" : "0 %"} del territorio recorrido
        </p>
      </div>
      <svg
        viewBox={`0 0 ${mapa.ancho} ${mapa.alto}`}
        className="mx-auto h-auto max-h-[560px] w-full"
        role="img"
        aria-label={`Mapa de Argentina: ${set.size} de ${TOTAL_PROVINCIAS} provincias recorridas${set.size ? ` (${[...set].join(", ")})` : ""}`}
      >
        {mapa.provincias.map((p) => {
          const si = set.has(p.nombre);
          return (
            <path
              key={p.nombre}
              d={p.d}
              fill={si ? "#ee5d10" : "#23262b"}
              fillOpacity={si ? 0.9 : 1}
              stroke={si ? "#ffb48a" : "#3a3f47"}
              strokeWidth={0.8}
              strokeLinejoin="round"
            >
              <title>{`${p.nombre}${si ? " · recorrida" : ""}`}</title>
            </path>
          );
        })}
        {/* CABA es diminuta: un punto para que se vea */}
        {caba && set.has(caba.nombre) && <circle cx={caba.cx} cy={caba.cy} r={3} fill="#ee5d10" stroke="#ffb48a" strokeWidth={0.8} />}
      </svg>
      <figcaption className="text-center text-[10px] text-niebla/60">Límites: IGN (geoBoundaries, CC BY 3.0 IGO)</figcaption>
    </figure>
  );
}
