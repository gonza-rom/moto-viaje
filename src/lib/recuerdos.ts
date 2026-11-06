// "Hace un año…": viajes de años anteriores que pasaron en esta misma época del año.

import type { Foto, ViajeConRelaciones } from "./types";

export type Recuerdo = { anios: number; viaje: ViajeConRelaciones; fotos: Foto[] };

/** Hoy en Argentina, "YYYY-MM-DD" */
export function hoyAR(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(d);
}

/** Día del año (1–366) de "YYYY-MM-DD", ignorando el año (se usa un año bisiesto de referencia) */
function diaDelAnio(f: string) {
  const [, m, d] = f.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(2024, m - 1, d) - Date.UTC(2024, 0, 1)) / 86400000) + 1;
}

/** Distancia en días entre dos fechas sin mirar el año (circular: 30/12 y 2/1 están a 3 días) */
function distancia(a: string, b: string) {
  const d = Math.abs(diaDelAnio(a) - diaDelAnio(b));
  return Math.min(d, 366 - d);
}

/**
 * Viajes de años anteriores que estaban en curso en esta fecha (± margen días),
 * con las fotos de esos días primero (favoritas antes).
 */
export function recuerdosDeHoy(viajes: ViajeConRelaciones[], hoy = hoyAR(), margen = 3): Recuerdo[] {
  const anioHoy = Number(hoy.slice(0, 4));
  const out: Recuerdo[] = [];
  for (const v of viajes) {
    const anio = Number(v.fecha_inicio.slice(0, 4));
    if (anio >= anioHoy) continue;
    const ini = v.fecha_inicio;
    const fin = v.fecha_fin ?? v.fecha_inicio;
    // ¿Hoy (en el año del viaje) cae dentro del viaje, con margen?
    const hoyEnEseAnio = `${anio}${hoy.slice(4)}`;
    const dentro =
      (hoyEnEseAnio >= ini && hoyEnEseAnio <= fin) || distancia(ini, hoy) <= margen || distancia(fin, hoy) <= margen;
    if (!dentro) continue;
    const cerca = v.fotos.filter((f) => f.tomada_en && distancia(f.tomada_en, hoy) <= margen);
    const fotos = (cerca.length ? cerca : v.fotos).slice().sort((a, b) => Number(b.favorita) - Number(a.favorita)).slice(0, 4);
    out.push({ anios: anioHoy - anio, viaje: v, fotos });
  }
  return out.sort((a, b) => a.anios - b.anios);
}
