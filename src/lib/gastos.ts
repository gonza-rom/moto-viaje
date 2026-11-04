import type { Gasto, TipoGasto } from "./types";

export const TIPOS_GASTO: { valor: TipoGasto; label: string }[] = [
  { valor: "nafta", label: "Nafta" },
  { valor: "peaje", label: "Peaje" },
  { valor: "comida", label: "Comida" },
  { valor: "alojamiento", label: "Alojamiento" },
  { valor: "repuestos", label: "Repuestos" },
  { valor: "otro", label: "Otro" },
];

export const labelGasto = (t: string) => TIPOS_GASTO.find((x) => x.valor === t)?.label ?? t;

const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
export const plata = (n: number | null | undefined) => ars.format(Number(n || 0));

export type Resumen = {
  total: number;
  porTipo: { tipo: TipoGasto; total: number }[];
  litros: number;
  nafta: number;
  /** $ por litro promedio */
  precioLitro: number | null;
};

export function resumirGastos(gastos: Gasto[]): Resumen {
  const total = gastos.reduce((a, g) => a + Number(g.monto), 0);
  const nafta = gastos.filter((g) => g.tipo === "nafta");
  const litros = nafta.reduce((a, g) => a + Number(g.litros || 0), 0);
  const montoNafta = nafta.reduce((a, g) => a + Number(g.monto), 0);
  const porTipo = TIPOS_GASTO.map(({ valor }) => ({
    tipo: valor,
    total: gastos.filter((g) => g.tipo === valor).reduce((a, g) => a + Number(g.monto), 0),
  })).filter((x) => x.total > 0);
  return { total, porTipo, litros, nafta: montoNafta, precioLitro: litros ? montoNafta / litros : null };
}

/**
 * Consumo por el método de tanque lleno: entre dos cargas "lleno" con odómetro,
 * km recorridos / litros cargados después de la primera (incluida la segunda).
 * Devuelve km/l o null si no hay datos suficientes.
 */
export function consumoTanqueLleno(cargas: Gasto[]): number | null {
  const c = cargas
    .filter((g) => g.tipo === "nafta" && g.litros && g.odometro !== null)
    .sort((a, b) => a.odometro! - b.odometro!);
  let km = 0;
  let litros = 0;
  let desde: number | null = null;
  let acumulado = 0;
  for (const g of c) {
    if (desde !== null) acumulado += Number(g.litros);
    if (g.lleno) {
      if (desde !== null && g.odometro! > desde) {
        km += g.odometro! - desde;
        litros += acumulado;
      }
      desde = g.odometro!;
      acumulado = 0;
    }
  }
  return litros > 0 && km > 0 ? km / litros : null;
}

/** Consumo aproximado de un viaje: km del viaje / litros cargados en el viaje */
export function consumoViaje(km: number, gastos: Gasto[]): number | null {
  const litros = gastos.filter((g) => g.tipo === "nafta").reduce((a, g) => a + Number(g.litros || 0), 0);
  return litros > 0 && km > 0 ? km / litros : null;
}
