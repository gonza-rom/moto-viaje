"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, LoaderCircle, Mountain, MountainSnow } from "lucide-react";
import { parseGpx, type Punto } from "@/lib/gpx";
import { guardarAltimetria } from "@/app/acciones-extra";
import type { Altimetria as Datos } from "@/lib/types";

// Naranja validado para marcas sobre el fondo oscuro (el de la marca es demasiado claro para el contraste de línea)
const SERIE = "#ee5d10";
const GRID = "#2f333a";
const N_MUESTRAS = 150;

const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

function hav([a, b]: Punto, [c, d]: Punto) {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Toma N puntos equidistantes (por distancia) a lo largo del recorrido */
function muestrear(puntos: Punto[], n: number): { p: Punto; km: number }[] {
  const acum = [0];
  for (let i = 1; i < puntos.length; i++) acum.push(acum[i - 1] + hav(puntos[i - 1], puntos[i]));
  const total = acum[acum.length - 1];
  if (!total) return [];
  const out: { p: Punto; km: number }[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const objetivo = (total * k) / (n - 1);
    while (j < acum.length - 2 && acum[j + 1] < objetivo) j++;
    out.push({ p: puntos[j], km: objetivo });
  }
  return out;
}

/** Alturas con Open-Meteo (gratis, sin API key; hasta 100 puntos por pedido) */
async function calcular(puntos: Punto[]): Promise<Datos | null> {
  const m = muestrear(puntos, N_MUESTRAS);
  if (m.length < 2) return null;
  const alturas: number[] = [];
  for (let i = 0; i < m.length; i += 100) {
    const lote = m.slice(i, i + 100);
    const lat = lote.map((x) => x.p[0].toFixed(5)).join(",");
    const lng = lote.map((x) => x.p[1].toFixed(5)).join(",");
    const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`);
    if (!r.ok) throw new Error("No se pudo obtener la altura");
    const j = (await r.json()) as { elevation: number[] };
    alturas.push(...j.elevation);
  }
  let subida = 0;
  let bajada = 0;
  for (let i = 1; i < alturas.length; i++) {
    const d = alturas[i] - alturas[i - 1];
    if (d > 0) subida += d;
    else bajada -= d;
  }
  return {
    puntos: m.map((x, i) => [Math.round(x.km * 100) / 100, Math.round(alturas[i])]),
    max: Math.max(...alturas),
    min: Math.min(...alturas),
    subida,
    bajada,
  };
}

export default function Altimetria({
  viajeId,
  inicial,
  gpxUrl,
  trazo,
  soloLectura = false,
}: {
  viajeId?: string;
  inicial: Datos | null;
  gpxUrl?: string | null;
  trazo?: Punto[] | null;
  soloLectura?: boolean;
}) {
  const [datos, setDatos] = useState<Datos | null>(inicial);
  const [estado, setEstado] = useState<"ok" | "cargando" | "error">(inicial ? "ok" : "cargando");
  const intentado = useRef(false);

  // Si no está calculada, calcularla una vez y guardarla
  useEffect(() => {
    if (inicial || intentado.current) return;
    if (soloLectura) return setEstado("error");
    intentado.current = true;
    (async () => {
      try {
        let puntos: Punto[] | null = null;
        if (gpxUrl) puntos = parseGpx(await (await fetch(gpxUrl)).text());
        if ((!puntos || puntos.length < 2) && trazo && trazo.length > 1) puntos = trazo;
        if (!puntos || puntos.length < 2) return setEstado("error");
        const d = await calcular(puntos);
        if (!d) return setEstado("error");
        setDatos(d);
        setEstado("ok");
        if (viajeId) guardarAltimetria(viajeId, d).catch(() => {});
      } catch {
        setEstado("error");
      }
    })();
  }, [inicial, soloLectura, gpxUrl, trazo, viajeId]);

  if (estado === "cargando") {
    return (
      <p className="flex items-center gap-2 text-sm text-niebla">
        <LoaderCircle className="size-4 animate-spin" /> Calculando la altura del recorrido…
      </p>
    );
  }
  if (!datos) return null;
  return <Grafico d={datos} />;
}

function Grafico({ d }: { d: Datos }) {
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const W = 720;
  const H = 180;
  const m = { t: 12, r: 12, b: 26, l: 48 };
  const kmMax = d.puntos[d.puntos.length - 1][0] || 1;

  // Eje Y con números redondos que contengan los datos
  const { y0, y1, ticks } = useMemo(() => {
    const rango = Math.max(50, d.max - d.min);
    const paso = [50, 100, 200, 250, 500, 1000, 2000].find((p) => rango / p <= 4) ?? 2000;
    const a = Math.floor(d.min / paso) * paso;
    const b = Math.ceil(d.max / paso) * paso;
    const t: number[] = [];
    for (let v = a; v <= b; v += paso) t.push(v);
    return { y0: a, y1: b === a ? a + paso : b, ticks: t };
  }, [d]);

  const x = (km: number) => m.l + (km / kmMax) * (W - m.l - m.r);
  const y = (h: number) => m.t + (1 - (h - y0) / (y1 - y0)) * (H - m.t - m.b);
  const linea = d.puntos.map(([km, h], i) => `${i ? "L" : "M"}${x(km).toFixed(1)},${y(h).toFixed(1)}`).join("");
  const area = `${linea}L${x(kmMax).toFixed(1)},${y(y0)}L${x(0)},${y(y0)}Z`;
  const ticksX = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(kmMax * f));

  function mover(clientX: number) {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    const km = ((clientX - r.left) / r.width * W - m.l) / (W - m.l - m.r) * kmMax;
    let mejor = 0;
    for (let i = 1; i < d.puntos.length; i++) if (Math.abs(d.puntos[i][0] - km) < Math.abs(d.puntos[mejor][0] - km)) mejor = i;
    setHover(mejor);
  }

  const p = hover !== null ? d.puntos[hover] : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icono={<MountainSnow className="size-3.5" />} label="Altura máxima" valor={`${nf.format(d.max)} m`} />
        <Stat icono={<Mountain className="size-3.5" />} label="Altura mínima" valor={`${nf.format(d.min)} m`} />
        <Stat icono={<ArrowUpRight className="size-3.5" />} label="Subida acumulada" valor={`${nf.format(d.subida)} m`} />
        <Stat icono={<ArrowDownRight className="size-3.5" />} label="Bajada acumulada" valor={`${nf.format(d.bajada)} m`} />
      </div>
      <figure className="relative">
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-pan-y select-none"
          role="img"
          aria-label={`Perfil de altura: de ${nf.format(d.min)} a ${nf.format(d.max)} metros en ${nf1.format(kmMax)} km`}
          onPointerMove={(e) => mover(e.clientX)}
          onPointerDown={(e) => mover(e.clientX)}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-niebla text-[11px]">
                {nf.format(t)}
              </text>
            </g>
          ))}
          {ticksX.map((t, i) => (
            <text key={i} x={x(t)} y={H - 6} textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"} className="fill-niebla text-[11px]">
              {nf.format(t)} km
            </text>
          ))}
          <path d={area} fill={SERIE} fillOpacity={0.1} />
          <path d={linea} fill="none" stroke={SERIE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {p && (
            <g pointerEvents="none">
              <line x1={x(p[0])} x2={x(p[0])} y1={m.t} y2={H - m.b} stroke="#9aa0a8" strokeWidth={1} />
              <circle cx={x(p[0])} cy={y(p[1])} r={5} fill={SERIE} stroke="#17191c" strokeWidth={2} />
            </g>
          )}
        </svg>
        {p && (
          <div
            className="pointer-events-none absolute top-0 rounded-lg border border-linea bg-asfalto/95 px-2.5 py-1.5 text-xs shadow-lg"
            style={{
              left: `${(x(p[0]) / W) * 100}%`,
              transform: `translateX(${x(p[0]) / W > 0.7 ? "-105%" : "8px"})`,
            }}
          >
            <p className="font-semibold text-white">{nf.format(p[1])} m</p>
            <p className="text-niebla">km {nf1.format(p[0])}</p>
          </div>
        )}
        <figcaption className="sr-only">
          Perfil de altura del recorrido. Máxima {nf.format(d.max)} m, mínima {nf.format(d.min)} m, subida acumulada{" "}
          {nf.format(d.subida)} m.
        </figcaption>
      </figure>
      <p className="text-[11px] text-niebla/70">Alturas aproximadas (Open-Meteo / Copernicus DEM).</p>
    </div>
  );
}

function Stat({ icono, label, valor }: { icono: React.ReactNode; label: string; valor: string }) {
  return (
    <div className="rounded-xl bg-grafito/60 p-3">
      <p className="flex items-center gap-1 text-xs text-niebla">
        {icono} {label}
      </p>
      <p className="font-display text-xl font-bold">{valor}</p>
    </div>
  );
}
