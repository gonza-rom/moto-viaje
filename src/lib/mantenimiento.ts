import type { Gasto, Mantenimiento, Moto, Viaje } from "./types";

/** Tipos de mantenimiento con intervalos sugeridos (editables en cada registro) */
export const TIPOS_MANT: { valor: string; label: string; km: number | null; meses: number | null }[] = [
  { valor: "aceite", label: "Cambio de aceite", km: 3000, meses: 6 },
  { valor: "service", label: "Service general", km: 6000, meses: 12 },
  { valor: "cadena", label: "Cadena (limpiar y lubricar)", km: 600, meses: null },
  { valor: "kit_arrastre", label: "Kit de arrastre", km: 20000, meses: null },
  { valor: "cubierta_del", label: "Cubierta delantera", km: 15000, meses: 48 },
  { valor: "cubierta_tras", label: "Cubierta trasera", km: 10000, meses: 48 },
  { valor: "frenos", label: "Pastillas de freno", km: 10000, meses: null },
  { valor: "filtro_aire", label: "Filtro de aire", km: 6000, meses: 12 },
  { valor: "bujia", label: "Bujía", km: 8000, meses: null },
  { valor: "bateria", label: "Batería", km: null, meses: 30 },
  { valor: "otro", label: "Otro", km: null, meses: null },
];

export const labelMant = (t: string) => TIPOS_MANT.find((x) => x.valor === t)?.label ?? t;

/**
 * Odómetro actual estimado de una moto: el mayor dato conocido entre
 * odómetro de llegada de viajes, cargas de nafta, mantenimientos y (km iniciales + km de viajes + km de jornadas).
 */
export function odometroActual(
  moto: Moto,
  viajes: Pick<Viaje, "moto_id" | "km" | "odometro_fin">[],
  gastos: Pick<Gasto, "moto_id" | "odometro">[],
  mants: Pick<Mantenimiento, "moto_id" | "odometro">[],
  jornadas: { moto_id: string | null; km: number }[] = []
): number | null {
  const suyos = viajes.filter((v) => v.moto_id === moto.id);
  const kmTrabajo = jornadas.filter((j) => j.moto_id === moto.id).reduce((a, j) => a + Number(j.km || 0), 0);
  const candidatos = [
    ...suyos.map((v) => v.odometro_fin),
    ...gastos.filter((g) => g.moto_id === moto.id).map((g) => g.odometro),
    ...mants.filter((m) => m.moto_id === moto.id).map((m) => m.odometro),
    moto.km_iniciales ? moto.km_iniciales + suyos.reduce((a, v) => a + Number(v.km), 0) + kmTrabajo : null,
  ].filter((n): n is number => typeof n === "number" && n > 0);
  return candidatos.length ? Math.max(...candidatos) : null;
}

export type EstadoMant = {
  tipo: string;
  label: string;
  ultimo: Mantenimiento;
  /** km que faltan (negativo = pasado) */
  faltanKm: number | null;
  /** días que faltan (negativo = pasado) */
  faltanDias: number | null;
  estado: "ok" | "pronto" | "vencido" | "sin-dato";
};

const DIA = 86400000;

/** Estado de cada tipo de mantenimiento según el último registro de ese tipo */
export function estadosMantenimiento(mants: Mantenimiento[], odometro: number | null, hoy = new Date()): EstadoMant[] {
  const ultimos = new Map<string, Mantenimiento>();
  for (const m of [...mants].sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.odometro ?? 0) - (a.odometro ?? 0))) {
    if (!ultimos.has(m.tipo)) ultimos.set(m.tipo, m);
  }
  return [...ultimos.values()]
    .map((m) => {
      const faltanKm =
        m.cada_km && m.odometro !== null && odometro !== null ? m.odometro + m.cada_km - odometro : null;
      let faltanDias: number | null = null;
      if (m.cada_meses) {
        const vence = new Date(`${m.fecha}T00:00:00`);
        vence.setMonth(vence.getMonth() + m.cada_meses);
        faltanDias = Math.round((vence.getTime() - hoy.getTime()) / DIA);
      }
      const vencido = (faltanKm !== null && faltanKm <= 0) || (faltanDias !== null && faltanDias <= 0);
      const pronto =
        (faltanKm !== null && m.cada_km && faltanKm <= Math.max(200, m.cada_km * 0.15)) ||
        (faltanDias !== null && faltanDias <= 30);
      const estado: EstadoMant["estado"] =
        faltanKm === null && faltanDias === null ? "sin-dato" : vencido ? "vencido" : pronto ? "pronto" : "ok";
      return { tipo: m.tipo, label: labelMant(m.tipo), ultimo: m, faltanKm, faltanDias, estado };
    })
    .sort((a, b) => {
      const orden = { vencido: 0, pronto: 1, ok: 2, "sin-dato": 3 };
      return orden[a.estado] - orden[b.estado];
    });
}

export function textoFalta(e: EstadoMant) {
  const partes: string[] = [];
  if (e.faltanKm !== null) {
    partes.push(e.faltanKm <= 0 ? `pasado ${fmt(-e.faltanKm)} km` : `faltan ${fmt(e.faltanKm)} km`);
  }
  if (e.faltanDias !== null) {
    const d = Math.abs(e.faltanDias);
    const t = d >= 60 ? `${Math.round(d / 30)} meses` : `${d} días`;
    partes.push(e.faltanDias <= 0 ? `vencido hace ${t}` : `en ${t}`);
  }
  return partes.join(" · ") || "sin intervalo";
}

const fmt = (n: number) => new Intl.NumberFormat("es-AR").format(Math.round(n));
