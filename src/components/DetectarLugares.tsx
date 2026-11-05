"use client";

import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, MapPin, RefreshCw } from "lucide-react";
import { detectarLugares } from "@/app/acciones-extra";

/**
 * Si hay fotos con GPS sin lugar detectado, las procesa solo (en tandas) y avisa al terminar.
 * Se muestra arriba de la galería.
 */
export function DetectarLugares({ pendientes }: { pendientes: number }) {
  const [total] = useState(pendientes);
  const [hechas, setHechas] = useState(0);
  const [estado, setEstado] = useState<"trabajando" | "listo" | "error">("trabajando");
  const [error, setError] = useState("");
  const corriendo = useRef(false);

  useEffect(() => {
    if (!pendientes || corriendo.current) return;
    corriendo.current = true;
    let cancelado = false;
    (async () => {
      let quedan = pendientes;
      let vueltas = 0;
      while (quedan > 0 && !cancelado && vueltas++ < 200) {
        if (!navigator.onLine) {
          setEstado("error");
          setError("Sin señal: se va a completar la próxima vez que abras la página con conexión.");
          return;
        }
        const r = await detectarLugares().catch((e: Error) => ({ hechas: 0, pendientes: quedan, error: e.message }));
        if (r.error || (!r.hechas && r.pendientes >= quedan)) {
          setEstado("error");
          setError(r.error || "No se pudo detectar el lugar de algunas fotos.");
          return;
        }
        setHechas((h) => h + r.hechas);
        quedan = r.pendientes;
      }
      if (!cancelado) setEstado("listo");
    })();
    return () => {
      cancelado = true;
    };
  }, [pendientes]);

  if (!pendientes) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
        estado === "error" ? "border-amber-500/40 bg-amber-500/10 text-amber-100" : "border-linea bg-grafito/60 text-niebla"
      }`}
      role="status"
    >
      {estado === "trabajando" && (
        <>
          <LoaderCircle className="size-4 animate-spin text-naranja" />
          Detectando dónde sacaste las fotos… {Math.min(hechas, total)}/{total}
        </>
      )}
      {estado === "listo" && (
        <>
          <Check className="size-4 text-emerald-400" />
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" /> Lugares detectados en {hechas} {hechas === 1 ? "foto" : "fotos"}
          </span>
          <button type="button" onClick={() => window.location.reload()} className="btn-ghost ml-auto px-3 py-1 text-xs">
            <RefreshCw className="size-3.5" /> Ver
          </button>
        </>
      )}
      {estado === "error" && <>{error}</>}
    </div>
  );
}
