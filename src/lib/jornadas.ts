// Jornadas de trabajo: resumen de un track y totales (km, horas, plata). Servidor y navegador.

import { haversine, type Punto, type PuntoT } from "./gpx";
import { reducir } from "./recorrido";
import type { Gasto, Jornada } from "./types";

/** Velocidad mínima para contar como "en movimiento" (km/h) */
const EN_MOVIMIENTO_KMH = 4;

export type ResumenTrack = {
  km: number;
  inicio: string | null;
  fin: string | null;
  minutosTotal: number | null;
  minutosMovimiento: number | null;
  recorrido: Punto[];
};

/** Km, horario y tiempo en movimiento de un track (los saltos de GPS imposibles se ignoran) */
export function resumirTrack(pts: PuntoT[]): ResumenTrack {
  let km = 0;
  let movMs = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = haversine(pts[i - 1].p, pts[i].p);
    const a = pts[i - 1].t;
    const b = pts[i].t;
    if (a !== null && b !== null && b > a) {
      const kmh = d / ((b - a) / 3600000);
      if (kmh > 200) continue; // salto del GPS
      if (kmh >= EN_MOVIMIENTO_KMH && b - a < 5 * 60000) movMs += b - a;
    }
    km += d;
  }
  const tiempos = pts.map((x) => x.t).filter((t): t is number => t !== null);
  const t0 = tiempos.length ? Math.min(...tiempos) : null;
  const t1 = tiempos.length ? Math.max(...tiempos) : null;
  return {
    km: Math.round(km * 10) / 10,
    inicio: t0 ? new Date(t0).toISOString() : null,
    fin: t1 ? new Date(t1).toISOString() : null,
    minutosTotal: t0 && t1 ? Math.round((t1 - t0) / 60000) : null,
    minutosMovimiento: tiempos.length > 1 ? Math.round(movMs / 60000) : null,
    recorrido: reducir(
      pts.map((x) => x.p),
      2000
    ).map(([a, b]) => [Math.round(a * 1e5) / 1e5, Math.round(b * 1e5) / 1e5] as Punto),
  };
}

export type Totales = {
  jornadas: number;
  km: number;
  minutos: number;
  ingresos: number;
  gastos: number;
  nafta: number;
  neto: number;
  porKm: number | null;
  porHora: number | null;
  viajes: number;
};

/** Totales de un conjunto de jornadas con sus gastos */
export function totalesJornadas(js: Jornada[], gastos: Gasto[]): Totales {
  const ids = new Set(js.map((j) => j.id));
  const suyos = gastos.filter((g) => g.jornada_id && ids.has(g.jornada_id));
  const km = js.reduce((a, j) => a + Number(j.km || 0), 0);
  const minutos = js.reduce((a, j) => a + (j.minutos_total ?? 0), 0);
  const ingresos = js.reduce((a, j) => a + Number(j.ingresos || 0) + Number(j.propinas || 0), 0);
  const gastosTot = suyos.reduce((a, g) => a + Number(g.monto || 0), 0);
  const neto = ingresos - gastosTot;
  return {
    jornadas: js.length,
    km,
    minutos,
    ingresos,
    gastos: gastosTot,
    nafta: suyos.filter((g) => g.tipo === "nafta").reduce((a, g) => a + Number(g.monto || 0), 0),
    neto,
    porKm: km > 0 && ingresos ? neto / km : null,
    porHora: minutos > 0 && ingresos ? neto / (minutos / 60) : null,
    viajes: js.reduce((a, j) => a + (j.viajes ?? 0), 0),
  };
}

/** "5 h 20 min" */
export const horasTxt = (min: number | null | undefined) => {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
};

/** Lunes de la semana de una fecha "YYYY-MM-DD" */
export function lunesDe(f: string) {
  const d = new Date(`${f}T12:00:00Z`);
  const dia = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dia);
  return d.toISOString().slice(0, 10);
}
