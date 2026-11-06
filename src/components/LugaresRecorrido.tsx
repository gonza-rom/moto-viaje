"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, MapPinned, RefreshCw } from "lucide-react";
import { parseGpx, type Punto } from "@/lib/gpx";
import { nombrarLugar, type Ruta } from "@/lib/ruta";
import { muestrear } from "@/lib/recorrido";
import { guardarLugaresRecorrido } from "@/app/acciones-extra";
import type { LugarRecorrido } from "@/lib/types";

const CADA_KM = 20;

/**
 * "Pasaste por": localidades a lo largo del recorrido (GPX o ruta trazada).
 * Si todavía no se calcularon, las busca una vez (OpenStreetMap, 1 pedido por segundo) y las guarda.
 */
export function LugaresRecorrido({
  viajeId,
  lugares: guardados,
  gpxUrl,
  ruta,
  editable = false,
}: {
  viajeId: string;
  lugares: LugarRecorrido[] | null;
  gpxUrl: string | null;
  ruta: Ruta | null;
  editable?: boolean;
}) {
  const [lugares, setLugares] = useState<LugarRecorrido[] | null>(guardados);
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const corriendo = useRef(false);
  const hayRecorrido = !!gpxUrl || (ruta?.trazo?.length ?? 0) > 1;

  async function buscar() {
    if (corriendo.current) return;
    corriendo.current = true;
    setError("");
    try {
      let puntos: Punto[] = [];
      if (gpxUrl) puntos = parseGpx(await (await fetch(gpxUrl)).text());
      if (puntos.length < 2 && ruta?.trazo) puntos = ruta.trazo;
      if (puntos.length < 2) throw new Error("El recorrido no tiene puntos");

      const muestras = muestrear(puntos, CADA_KM);
      setProgreso({ hechos: 0, total: muestras.length });
      const encontrados: LugarRecorrido[] = [];
      for (const [i, m] of muestras.entries()) {
        if (!navigator.onLine) throw new Error("Sin señal: se va a completar la próxima vez que abras el viaje con conexión.");
        const l = await nombrarLugar(m.punto[0], m.punto[1]);
        setProgreso({ hechos: i + 1, total: muestras.length });
        if (!l?.nombre) continue;
        // Mismo lugar que el anterior (tramo dentro de un mismo municipio): no repetir
        if (encontrados[encontrados.length - 1]?.nombre === l.nombre) continue;
        encontrados.push({
          nombre: l.nombre,
          ...(l.provincia ? { provincia: l.provincia } : {}),
          ...(l.pais ? { pais: l.pais } : {}),
          km: Math.round(m.km * 10) / 10,
          lat: m.punto[0],
          lng: m.punto[1],
        });
        setLugares([...encontrados]);
      }
      if (!encontrados.length) throw new Error("No se encontraron localidades en el recorrido");
      const r = await guardarLugaresRecorrido(viajeId, encontrados);
      if (r?.error) throw new Error(r.error);
      setLugares(encontrados);
    } catch (e) {
      setError((e as Error).message || "No se pudieron buscar las localidades");
    } finally {
      setProgreso(null);
      corriendo.current = false;
    }
  }

  // Primera vez: buscarlas solas
  useEffect(() => {
    if (editable && guardados === null && hayRecorrido) buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!hayRecorrido || (!lugares?.length && !progreso && !error && !editable)) return null;

  // Agrupar por provincia, en el orden del recorrido
  const tramos: { provincia: string; lugares: LugarRecorrido[] }[] = [];
  for (const l of lugares ?? []) {
    const p = l.provincia ?? "";
    if (tramos[tramos.length - 1]?.provincia !== p) tramos.push({ provincia: p, lugares: [] });
    tramos[tramos.length - 1].lugares.push(l);
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-display text-3xl font-bold uppercase">
          <MapPinned className="size-6 text-naranja" /> Pasaste por
        </h2>
        {lugares && lugares.length > 0 && <span className="text-sm text-niebla">{lugares.length} localidades</span>}
        {editable && !progreso && lugares !== null && (
          <button type="button" onClick={buscar} className="btn-ghost ml-auto px-3 py-1 text-xs" title="Volver a buscar">
            <RefreshCw className="size-3.5" /> Actualizar
          </button>
        )}
      </div>

      {progreso && (
        <p className="flex items-center gap-2 text-sm text-niebla" role="status">
          <LoaderCircle className="size-4 animate-spin text-naranja" />
          Buscando las localidades del recorrido… {progreso.hechos}/{progreso.total}
        </p>
      )}
      {error && (
        <p className="text-sm text-amber-200">
          {error}{" "}
          {editable && (
            <button type="button" onClick={buscar} className="underline">
              Reintentar
            </button>
          )}
        </p>
      )}

      {tramos.length > 0 && (
        <ol className="space-y-2">
          {tramos.map((t, i) => (
            <li key={i} className="space-y-1">
              {t.provincia && <p className="text-xs font-semibold tracking-wide text-niebla uppercase">{t.provincia}</p>}
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
                {t.lugares.map((l, j) => (
                  <span key={j} className="flex items-center gap-1.5">
                    {(i > 0 || j > 0) && <span className="text-niebla/60">→</span>}
                    <span className="rounded-full border border-linea px-2.5 py-0.5" title={`km ${Math.round(l.km)}`}>
                      {l.nombre}
                    </span>
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
