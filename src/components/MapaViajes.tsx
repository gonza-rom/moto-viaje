"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Polyline, Popup } from "react-leaflet";
import { parseGpx, type Punto } from "@/lib/gpx";
import { CapasBase, Encuadrar, MapaVacio, NARANJA, esTactil } from "./mapa/base";

export type ViajeEnMapa = {
  id: string;
  titulo: string;
  km: string;
  fechas: string;
  trazo: Punto[] | null;
  gpx_url: string | null;
};

const reducir = (p: Punto[], max = 400) => {
  const paso = Math.max(1, Math.ceil(p.length / max));
  return p.filter((_, i) => i % paso === 0 || i === p.length - 1);
};

/** Todos los recorridos juntos (dashboard). Los viajes sin ruta trazada usan su GPX. */
export default function MapaViajes({ viajes }: { viajes: ViajeEnMapa[] }) {
  const [gpx, setGpx] = useState<Record<string, Punto[]>>({});
  const [activo, setActivo] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    for (const v of viajes) {
      if (v.trazo || !v.gpx_url) continue;
      fetch(v.gpx_url)
        .then((r) => r.text())
        .then((t) => vivo && setGpx((g) => ({ ...g, [v.id]: reducir(parseGpx(t)) })))
        .catch(() => {});
    }
    return () => {
      vivo = false;
    };
  }, [viajes]);

  const lineas = useMemo(
    () =>
      viajes
        .map((v) => ({ ...v, puntos: v.trazo ?? gpx[v.id] ?? null }))
        .filter((v): v is typeof v & { puntos: Punto[] } => !!v.puntos && v.puntos.length > 1),
    [viajes, gpx]
  );
  const todos = useMemo(() => lineas.flatMap((l) => l.puntos) as [number, number][], [lineas]);

  if (!lineas.length) return <MapaVacio>Cargando recorridos…</MapaVacio>;

  return (
    <MapContainer bounds={todos} boundsOptions={{ padding: [28, 28] }} scrollWheelZoom={false} dragging={!esTactil()} className="size-full">
      <CapasBase />
      <Encuadrar puntos={todos} clave={lineas.length} />
      {lineas.map((v) => (
        <Polyline
          key={v.id}
          positions={v.puntos}
          pathOptions={{
            color: activo === v.id ? "#ffffff" : NARANJA,
            weight: activo === v.id ? 6 : 4,
            opacity: activo && activo !== v.id ? 0.45 : 0.9,
          }}
          eventHandlers={{
            mouseover: () => setActivo(v.id),
            mouseout: () => setActivo(null),
          }}
        >
          <Popup>
            <div className="space-y-0.5">
              <Link href={`/viajes/${v.id}`} className="font-semibold text-[#d9530c] underline">
                {v.titulo}
              </Link>
              <p className="text-xs text-gray-600">
                {v.km} · {v.fechas}
              </p>
            </div>
          </Popup>
        </Polyline>
      ))}
    </MapContainer>
  );
}
