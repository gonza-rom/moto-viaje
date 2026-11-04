"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { LayersControl, TileLayer, useMap } from "react-leaflet";
import { cldMiniatura } from "@/lib/cld";

export const NARANJA = "#ff6a1a";

/** Capas de fondo: oscuro (default), satélite y topográfico. Todas gratis y sin API key. */
export function CapasBase() {
  return (
    <LayersControl position="topright">
      <LayersControl.BaseLayer checked name="Oscuro">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name="Satélite">
        <TileLayer
          attribution="&copy; Esri, Maxar, Earthstar Geographics"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
        />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name="Topográfico">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
          url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
          maxZoom={17}
        />
      </LayersControl.BaseLayer>
    </LayersControl>
  );
}

/** Marcador redondo numerado (sin las imágenes por defecto de Leaflet, que se rompen con bundlers) */
export function iconoParada(texto: string | number, tipo: "inicio" | "medio" | "fin") {
  return L.divIcon({
    className: "",
    html: `<div class="parada parada-${tipo}">${texto}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

export const tipoParada = (i: number, total: number) => (i === 0 ? "inicio" : i === total - 1 ? "fin" : "medio");

/** Reencuadra el mapa cuando cambia `clave` */
export function Encuadrar({ puntos, clave }: { puntos: [number, number][]; clave: unknown }) {
  const map = useMap();
  useEffect(() => {
    if (puntos.length === 1) map.setView(puntos[0], Math.max(map.getZoom(), 11));
    else if (puntos.length > 1) map.fitBounds(L.latLngBounds(puntos), { padding: [32, 32], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, map]);
  return null;
}

export function MapaVacio({ children }: { children: React.ReactNode }) {
  return <div className="grid h-full place-items-center p-4 text-center text-sm text-niebla">{children}</div>;
}

/** En celulares, los mapas de solo lectura no capturan el arrastre con un dedo (si no, la página no scrollea).
 *  Se hace zoom con dos dedos. */
export const esTactil = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

/** Marcador con la miniatura de una foto */
export function iconoFoto(f: { public_id: string; tipo: "image" | "video" }) {
  const src = cldMiniatura(f, { w: 80, h: 80, crop: "fill" });
  return L.divIcon({
    className: "",
    html: `<div class="marcador-foto${f.tipo === "video" ? " es-video" : ""}"><img src="${src}" alt="" loading="lazy" /></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}
