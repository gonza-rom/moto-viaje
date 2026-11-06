// Cálculos sobre un recorrido (lista de puntos [lat, lng]). Sin dependencias: servidor y navegador.

import { haversine, type Punto } from "./gpx";

/** Km acumulados en cada punto */
export function kmAcumulados(puntos: Punto[]): number[] {
  const acum = [0];
  for (let i = 1; i < puntos.length; i++) acum.push(acum[i - 1] + haversine(puntos[i - 1], puntos[i]));
  return acum;
}

/** Un punto cada `cadaKm` km (incluye la salida y la llegada) */
export function muestrear(puntos: Punto[], cadaKm: number): { punto: Punto; km: number }[] {
  if (!puntos.length) return [];
  const acum = kmAcumulados(puntos);
  const total = acum[acum.length - 1];
  const out: { punto: Punto; km: number }[] = [{ punto: puntos[0], km: 0 }];
  let siguiente = cadaKm;
  for (let i = 1; i < puntos.length; i++) {
    if (acum[i] >= siguiente) {
      out.push({ punto: puntos[i], km: acum[i] });
      while (siguiente <= acum[i]) siguiente += cadaKm;
    }
  }
  if (total - out[out.length - 1].km > cadaKm / 4) out.push({ punto: puntos[puntos.length - 1], km: total });
  return out;
}

/** Km del recorrido más cercano a un punto, y a qué distancia queda (km) */
export function ubicarEnRecorrido(p: Punto, puntos: Punto[], acum: number[]): { km: number; desvio: number } {
  let mejor = { km: 0, desvio: Infinity };
  for (let i = 0; i < puntos.length; i++) {
    const d = haversine(p, puntos[i]);
    if (d < mejor.desvio) mejor = { km: acum[i], desvio: d };
  }
  return mejor;
}

/** Reduce a ~n puntos tomando uno cada tanto (para pedidos a APIs) */
export function reducir(puntos: Punto[], n: number): Punto[] {
  if (puntos.length <= n) return puntos;
  const paso = (puntos.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => puntos[Math.round(i * paso)]);
}
