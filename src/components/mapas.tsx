"use client";

import dynamic from "next/dynamic";
import { LoaderCircle } from "lucide-react";

// Leaflet necesita window: los mapas se cargan solo en el cliente
function Cargando() {
  return (
    <div className="grid h-full min-h-40 place-items-center text-sm text-niebla">
      <span className="flex items-center gap-2">
        <LoaderCircle className="size-4 animate-spin" /> Cargando mapa…
      </span>
    </div>
  );
}

export const MapaRutaLazy = dynamic(() => import("./MapaRuta"), { ssr: false, loading: Cargando });
export const EditorRutaLazy = dynamic(() => import("./EditorRuta"), { ssr: false, loading: Cargando });
export const MapaViajesLazy = dynamic(() => import("./MapaViajes"), { ssr: false, loading: Cargando });
