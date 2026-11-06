// Tarjeta del viaje como imagen (vista previa de links y para compartir en WhatsApp / Instagram).
// Se genera en el servidor con next/og. Solo servidor.

import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { dias, km, num, rangoFechas } from "./format";
import type { Punto } from "./gpx";
import { reducir } from "./recorrido";
import type { ViajeConRelaciones } from "./types";

export type Formato = "og" | "cuadrado";
export const TAMANOS: Record<Formato, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  cuadrado: { width: 1080, height: 1080 },
};

const NARANJA = "#ff6b1a";
const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

let fuentes: Promise<{ name: string; data: Buffer; weight: 500 | 700; style: "normal" }[]> | null = null;
function cargarFuentes() {
  fuentes ??= Promise.all(
    ([500, 700] as const).map(async (weight) => ({
      name: "Barlow",
      data: await readFile(join(process.cwd(), `assets/fonts/barlow-condensed-latin-${weight}-normal.woff`)),
      weight,
      style: "normal" as const,
    }))
  );
  return fuentes;
}

/** Puntos del recorrido: ruta trazada o GPX (parseo simple, sin DOMParser) */
async function puntosDe(v: ViajeConRelaciones): Promise<Punto[]> {
  if (v.ruta?.trazo && v.ruta.trazo.length > 1) return v.ruta.trazo;
  if (!v.gpx_url) return [];
  try {
    const xml = await (await fetch(v.gpx_url, { signal: AbortSignal.timeout(5000) })).text();
    const pts: Punto[] = [];
    for (const m of xml.matchAll(/<(?:trkpt|rtept)\b([^>]*)>/g)) {
      const lat = parseFloat(/lat="([^"]+)"/.exec(m[1])?.[1] ?? "");
      const lon = parseFloat(/lon="([^"]+)"/.exec(m[1])?.[1] ?? "");
      if (Number.isFinite(lat) && Number.isFinite(lon)) pts.push([lat, lon]);
    }
    return pts;
  } catch {
    return [];
  }
}

/** Línea SVG del recorrido dentro de una caja de ancho x alto */
function trazoSvg(puntos: Punto[], ancho: number, alto: number) {
  const pts = reducir(puntos, 400);
  const lats = pts.map((p) => p[0]);
  const lngs = pts.map((p) => p[1]);
  const latMed = ((Math.min(...lats) + Math.max(...lats)) / 2) * (Math.PI / 180);
  const xs = pts.map((p) => p[1] * Math.cos(latMed));
  const ys = pts.map((p) => -p[0]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const esc = Math.min((ancho - 24) / (x1 - x0 || 1e-6), (alto - 24) / (y1 - y0 || 1e-6));
  const dx = (ancho - (x1 - x0) * esc) / 2;
  const dy = (alto - (y1 - y0) * esc) / 2;
  const xy = pts.map((_, i) => [dx + (xs[i] - x0) * esc, dy + (ys[i] - y0) * esc] as const);
  return {
    d: xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" "),
    inicio: xy[0],
    fin: xy[xy.length - 1],
  };
}

function urlPortada(v: ViajeConRelaciones, w: number, h: number) {
  const f = v.fotos[0];
  if (!f) return null;
  const t = `f_jpg,q_80,c_fill,g_auto,w_${w},h_${h}`;
  return f.tipo === "video"
    ? `https://res.cloudinary.com/${CLOUD}/video/upload/so_1,${t}/${f.public_id}.jpg`
    : `https://res.cloudinary.com/${CLOUD}/image/upload/${t}/${f.public_id}`;
}

export async function tarjetaViaje(v: ViajeConRelaciones, formato: Formato, headers?: HeadersInit) {
  const { width, height } = TAMANOS[formato];
  const cuadrado = formato === "cuadrado";
  const [fonts, puntos] = await Promise.all([cargarFuentes(), puntosDe(v)]);
  const portada = urlPortada(v, width, height);

  const caja = cuadrado ? { w: 440, h: 360 } : { w: 380, h: 330 };
  const linea = puntos.length > 1 ? trazoSvg(puntos, caja.w, caja.h) : null;
  const d = dias(v.fecha_inicio, v.fecha_fin);
  const provincias = [...new Set((v.lugares ?? []).map((l) => l.provincia).filter(Boolean))];
  const datos = [
    { valor: km(v.km), label: "recorridos" },
    { valor: `${d}`, label: d === 1 ? "día" : "días" },
    ...(v.altimetria ? [{ valor: `${num(v.altimetria.max)} m`, label: "altura máx." }] : []),
    ...(v.lugares?.length ? [{ valor: `${v.lugares.length}`, label: "localidades" }] : []),
  ].slice(0, cuadrado ? 4 : 3);
  // (la fuente no tiene "→")
  const recorrido = [v.origen, v.destino].filter(Boolean).join(" – ");

  const bloqueTexto = (
    <div key="texto" style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: cuadrado ? "flex-end" : "space-between" }}>
            <div style={{ display: "flex", fontSize: 24, fontWeight: 700, letterSpacing: 4, color: NARANJA, textTransform: "uppercase" }}>
              Mis viajes en moto
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: cuadrado ? 12 : 0 }}>
              <div
                style={{
                  display: "flex",
                  fontSize: v.titulo.length > 40 ? (cuadrado ? 64 : 56) : cuadrado ? 84 : 72,
                  fontWeight: 700,
                  lineHeight: 0.95,
                  textTransform: "uppercase",
                }}
              >
                {v.titulo}
              </div>
              <div style={{ display: "flex", fontSize: 28, fontWeight: 500, color: "rgba(255,255,255,0.8)" }}>
                {rangoFechas(v.fecha_inicio, v.fecha_fin).replace(" → ", " – ")}
                {v.motos ? ` · ${v.motos.nombre}` : ""}
              </div>
              {recorrido && (
                <div style={{ display: "flex", fontSize: 26, fontWeight: 500, color: "rgba(255,255,255,0.65)" }}>{recorrido}</div>
              )}
              {provincias.length > 0 && (
                <div style={{ display: "flex", fontSize: 24, fontWeight: 500, color: "rgba(255,255,255,0.55)" }}>
                  {provincias.slice(0, 4).join(" · ")}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 40, marginTop: 28 }}>
              {datos.map((x) => (
                <div key={x.label} style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", fontSize: 56, fontWeight: 700, color: NARANJA, lineHeight: 1 }}>{x.valor}</div>
                  <div style={{ display: "flex", fontSize: 22, fontWeight: 500, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: 2 }}>
                    {x.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
  );
  const bloqueRuta = linea ? (
    <div key="ruta"
              style={{
                display: "flex",
                width: caja.w,
                height: caja.h,
                alignSelf: cuadrado ? "flex-end" : "center",
              }}
            >
              <svg width={caja.w} height={caja.h} viewBox={`0 0 ${caja.w} ${caja.h}`}>
                <path d={linea.d} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
                <path d={linea.d} fill="none" stroke={NARANJA} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
                {Math.hypot(linea.inicio[0] - linea.fin[0], linea.inicio[1] - linea.fin[1]) < 18 ? (
                  // Ida y vuelta: salida y llegada en el mismo lugar
                  <circle cx={linea.inicio[0]} cy={linea.inicio[1]} r={13} fill="white" stroke="#22c55e" strokeWidth={6} />
                ) : (
                  <>
                    <circle cx={linea.inicio[0]} cy={linea.inicio[1]} r={11} fill="#22c55e" stroke="white" strokeWidth={4} />
                    <circle cx={linea.fin[0]} cy={linea.fin[1]} r={11} fill="#ef4444" stroke="white" strokeWidth={4} />
                  </>
                )}
              </svg>
            </div>
  ) : null;

  return new ImageResponse(
    (
      <div style={{ width, height, display: "flex", position: "relative", background: "#0f0f10", color: "white", fontFamily: "Barlow" }}>
        {portada && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={portada} width={width} height={height} style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }} alt="" />
        )}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width,
            height,
            display: "flex",
            background: cuadrado
              ? "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.92) 100%)"
              : "linear-gradient(90deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.7) 55%, rgba(0,0,0,0.35) 100%)",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: cuadrado ? "column" : "row",
            width: "100%",
            height: "100%",
            padding: cuadrado ? 64 : 56,
            gap: 32,
          }}
        >
          {cuadrado ? [bloqueRuta, bloqueTexto] : [bloqueTexto, bloqueRuta]}
        </div>
      </div>
    ),
    { width, height, fonts, headers }
  );
}
