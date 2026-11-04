"use client";

import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Tooltip } from "react-leaflet";
import { parseGpx, type Punto } from "@/lib/gpx";
import type { Ruta } from "@/lib/ruta";
import type { TipoMedio } from "@/lib/cld";
import { CapasBase, MapaVacio, NARANJA, esTactil, iconoFoto, iconoParada, tipoParada } from "./mapa/base";

/** Foto con ubicación para mostrar como marcador */
export type FotoEnMapa = { id: string; public_id: string; tipo: TipoMedio; lat: number; lng: number; caption?: string | null };

/** Mismo nombre de evento que usa la Galería para abrir el visor */
const EVENTO_ABRIR_FOTO = "mv:abrir-foto";

/**
 * Muestra el recorrido de un viaje: el GPX real (si hay) y/o la ruta trazada a mano.
 * Si están los dos, el GPX va sólido y la ruta trazada punteada.
 */
export default function MapaRuta({
  url,
  puntos: puntosIniciales,
  ruta,
  fotos = [],
}: {
  url?: string | null;
  puntos?: Punto[];
  ruta?: Ruta | null;
  fotos?: FotoEnMapa[];
}) {
  const [gpx, setGpx] = useState<Punto[] | null>(puntosIniciales ?? null);
  const [estado, setEstado] = useState<"ok" | "cargando" | "error">(url && !puntosIniciales ? "cargando" : "ok");

  useEffect(() => {
    if (puntosIniciales) {
      setGpx(puntosIniciales);
      setEstado("ok");
      return;
    }
    if (!url) {
      setGpx(null);
      setEstado("ok");
      return;
    }
    let vivo = true;
    setEstado("cargando");
    fetch(url)
      .then((r) => r.text())
      .then((t) => vivo && (setGpx(parseGpx(t)), setEstado("ok")))
      .catch(() => vivo && setEstado("error"));
    return () => {
      vivo = false;
    };
  }, [url, puntosIniciales]);

  if (estado === "cargando") return <MapaVacio>Cargando ruta…</MapaVacio>;

  // Simplificar si es muy grande (performance)
  const paso = gpx ? Math.max(1, Math.floor(gpx.length / 4000)) : 1;
  const linea = gpx && gpx.length > 1 ? gpx.filter((_, i) => i % paso === 0 || i === gpx.length - 1) : null;
  const trazo = ruta?.trazo && ruta.trazo.length > 1 ? ruta.trazo : null;

  if (!linea && !trazo && !fotos.length) {
    return <MapaVacio>{estado === "error" ? "No se pudo cargar la ruta" : "El recorrido no tiene puntos"}</MapaVacio>;
  }

  const bounds = [...(linea ?? []), ...(trazo ?? []), ...fotos.map((f) => [f.lat, f.lng])] as [number, number][];
  // Un solo punto: Leaflet necesita un área, se arma una cajita alrededor
  if (bounds.length === 1) bounds.push([bounds[0][0] + 0.02, bounds[0][1] + 0.02], [bounds[0][0] - 0.02, bounds[0][1] - 0.02]);

  return (
    <MapContainer bounds={bounds} boundsOptions={{ padding: [28, 28] }} scrollWheelZoom={false} dragging={!esTactil()} className="size-full">
      <CapasBase />

      {trazo && (
        <Polyline
          positions={trazo}
          pathOptions={
            linea
              ? { color: "#ffffff", weight: 2.5, opacity: 0.7, dashArray: "6 8" }
              : { color: NARANJA, weight: 4, opacity: 0.95 }
          }
        />
      )}
      {linea && <Polyline positions={linea} pathOptions={{ color: NARANJA, weight: 4, opacity: 0.95 }} />}

      {ruta && ruta.paradas.length > 1
        ? ruta.paradas.map((p, i) => (
            <Marker
              key={i}
              position={[p.lat, p.lng]}
              icon={iconoParada(i + 1, tipoParada(i, ruta.paradas.length))}
            >
              {p.nombre && <Tooltip>{p.nombre}</Tooltip>}
            </Marker>
          ))
        : linea && (
            <>
              <CircleMarker center={linea[0]} radius={7} pathOptions={{ color: "#fff", fillColor: "#22c55e", fillOpacity: 1, weight: 2 }}>
                <Tooltip>Salida</Tooltip>
              </CircleMarker>
              <CircleMarker center={linea[linea.length - 1]} radius={7} pathOptions={{ color: "#fff", fillColor: "#ef4444", fillOpacity: 1, weight: 2 }}>
                <Tooltip>Llegada</Tooltip>
              </CircleMarker>
            </>
          )}

      {fotos.map((f) => (
        <Marker
          key={f.id}
          position={[f.lat, f.lng]}
          icon={iconoFoto(f)}
          eventHandlers={{ click: () => window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_FOTO, { detail: f.id })) }}
        >
          {f.caption && <Tooltip>{f.caption}</Tooltip>}
        </Marker>
      ))}
    </MapContainer>
  );
}
