"use client";

// Zonas donde más se anda: todos los recorridos de las jornadas superpuestos con poca opacidad.
// Donde se repiten muchas pasadas, la línea queda más intensa (funciona como mapa de calor).

import { MapContainer, Polyline } from "react-leaflet";
import type { Punto } from "@/lib/gpx";
import { CapasBase, MapaVacio, NARANJA, esTactil } from "./mapa/base";

export default function MapaZonas({ recorridos }: { recorridos: Punto[][] }) {
  const lineas = recorridos.filter((r) => r.length > 1);
  if (!lineas.length) return <MapaVacio>Todavía no hay recorridos grabados o importados</MapaVacio>;
  const todos = lineas.flat();
  // Encuadre: el 95 % central de los puntos (un viaje lejano no achica toda la ciudad)
  const lats = todos.map((p) => p[0]).sort((a, b) => a - b);
  const lngs = todos.map((p) => p[1]).sort((a, b) => a - b);
  const q = (arr: number[], f: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(f * (arr.length - 1))))];
  const bounds: [number, number][] = [
    [q(lats, 0.025), q(lngs, 0.025)],
    [q(lats, 0.975), q(lngs, 0.975)],
  ];
  const opacidad = Math.max(0.12, Math.min(0.6, 1.5 / Math.sqrt(lineas.length)));
  return (
    <MapContainer bounds={bounds} boundsOptions={{ padding: [20, 20] }} scrollWheelZoom={false} dragging={!esTactil()} className="size-full">
      <CapasBase />
      {lineas.map((r, i) => (
        <Polyline key={i} positions={r} pathOptions={{ color: NARANJA, weight: 4, opacity: opacidad }} />
      ))}
    </MapContainer>
  );
}
