"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { LayerGroup, LayersControl, TileLayer, useMap } from "react-leaflet";
import { cldMiniatura } from "@/lib/cld";

export const NARANJA = "#ff6a1a";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";

/**
 * Capas de fondo: oscuro (default), calles, satélite y topográfico. Todas gratis y sin API key.
 * (CARTO dejó de ser libre: devuelve "API KEY REQUIRED" en vez del mapa.)
 */
export function CapasBase() {
  return (
    <LayersControl position="topright">
      <LayersControl.BaseLayer checked name="Oscuro">
        <LayerGroup>
          <TileLayer attribution="&copy; Esri, HERE, Garmin, OSM" url={`${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`} maxZoom={16} />
          <TileLayer url={`${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`} maxZoom={16} />
        </LayerGroup>
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name="Calles">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name="Satélite">
        <LayerGroup>
          <TileLayer attribution="&copy; Esri, Maxar, Earthstar Geographics" url={`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`} maxZoom={19} />
          {/* Nombres de lugares y límites encima del satélite */}
          <TileLayer url={`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`} maxZoom={19} />
        </LayerGroup>
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
