"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleAlert, FileUp, LoaderCircle, Save, Trash2 } from "lucide-react";
import { guardarJornada } from "@/app/acciones-extra";
import { parseGpxConTiempo } from "@/lib/gpx";
import { kmlAGpx, esKml } from "@/lib/kml";
import { horasTxt, resumirTrack, type ResumenTrack } from "@/lib/jornadas";
import type { Jornada, Moto } from "@/lib/types";

/** "HH:MM" en hora de Argentina */
const horaAR = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) : "";
const fechaAR = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(iso));

export function JornadaForm({ jornada, motos }: { jornada?: Jornada; motos: Pick<Moto, "id" | "nombre">[] }) {
  const [estado, enviar, pendiente] = useActionState(guardarJornada.bind(null, jornada?.id ?? null), undefined);
  const hoy = fechaAR(new Date().toISOString());
  const [fecha, setFecha] = useState(jornada?.fecha ?? hoy);
  const [horaIni, setHoraIni] = useState(horaAR(jornada?.inicio ?? null));
  const [horaFin, setHoraFin] = useState(horaAR(jornada?.fin ?? null));
  const [km, setKm] = useState(jornada?.km ? String(jornada.km).replace(".", ",") : "");
  const [track, setTrack] = useState<ResumenTrack | null>(null);
  const [quitarRecorrido, setQuitarRecorrido] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [msjGpx, setMsjGpx] = useState("");
  const inputGpx = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (estado?.ir) window.location.replace(estado.ir);
  }, [estado]);

  async function importar(f: File) {
    setLeyendo(true);
    setMsjGpx("");
    try {
      const archivo = esKml(f) ? await kmlAGpx(f) : f;
      const pts = parseGpxConTiempo(await archivo.text());
      if (pts.length < 2) throw new Error("El archivo no tiene un recorrido");
      const r = resumirTrack(pts);
      setTrack(r);
      setQuitarRecorrido(false);
      setKm(String(r.km).replace(".", ","));
      if (r.inicio) {
        setFecha(fechaAR(r.inicio));
        setHoraIni(horaAR(r.inicio));
      }
      if (r.fin) setHoraFin(horaAR(r.fin));
      setMsjGpx(
        r.inicio
          ? `Recorrido: ${r.km} km · ${horasTxt(r.minutosTotal)} (en movimiento ${horasTxt(r.minutosMovimiento)})`
          : `Recorrido: ${r.km} km (el archivo no trae horarios: completalos a mano)`
      );
    } catch (e) {
      setMsjGpx((e as Error).message || "No se pudo leer el archivo");
    } finally {
      setLeyendo(false);
    }
  }

  const tieneRecorrido = !quitarRecorrido && (track || (jornada?.recorrido?.length ?? 0) > 1);

  return (
    <form action={enviar} className="space-y-5">
      <section className="card space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <label className="label" htmlFor="fecha">Día</label>
            <input id="fecha" name="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="hora_inicio">Empecé</label>
            <input id="hora_inicio" name="hora_inicio" type="time" value={horaIni} onChange={(e) => setHoraIni(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="hora_fin">Terminé</label>
            <input id="hora_fin" name="hora_fin" type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="km">Km</label>
            <input id="km" name="km" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} placeholder="120" className="input font-semibold" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="label" htmlFor="ingresos">Ganancia $</label>
            <input id="ingresos" name="ingresos" inputMode="decimal" defaultValue={jornada?.ingresos ?? ""} placeholder="45000" className="input font-semibold" />
          </div>
          <div>
            <label className="label" htmlFor="propinas">Propinas $</label>
            <input id="propinas" name="propinas" inputMode="decimal" defaultValue={jornada?.propinas ?? ""} placeholder="0" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="viajes">Viajes hechos</label>
            <input id="viajes" name="viajes" inputMode="numeric" defaultValue={jornada?.viajes ?? ""} placeholder="12" className="input" />
          </div>
          {motos.length > 0 && (
            <div>
              <label className="label" htmlFor="moto_id">Moto</label>
              <select id="moto_id" name="moto_id" defaultValue={jornada?.moto_id ?? motos[0].id} className="input">
                {motos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <label className="label" htmlFor="notas">Notas</label>
          <textarea id="notas" name="notas" rows={2} defaultValue={jornada?.notas ?? ""} placeholder="Zona, clima, algo para recordar…" className="input" />
        </div>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="label">Recorrido (opcional)</h2>
        <p className="text-xs text-niebla">
          Importá el GPX de una app que grabe de fondo (GPSLogger, Geo Tracker, OsmAnd, Strava): completa los km, el horario y el
          tiempo en movimiento, y suma tus calles al mapa de zonas.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => inputGpx.current?.click()} disabled={leyendo} className="btn-ghost disabled:opacity-50">
            {leyendo ? <LoaderCircle className="size-4 animate-spin" /> : <FileUp className="size-4" />}
            {tieneRecorrido ? "Reemplazar recorrido" : "Importar GPX / KML / KMZ"}
          </button>
          {tieneRecorrido && (
            <button type="button" onClick={() => (setTrack(null), setQuitarRecorrido(true), setMsjGpx(""))} className="btn-ghost text-red-400">
              <Trash2 className="size-4" /> Quitar recorrido
            </button>
          )}
          <input
            ref={inputGpx}
            type="file"
            accept=".gpx,.kml,.kmz,application/gpx+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importar(f);
              e.target.value = "";
            }}
          />
        </div>
        {msjGpx && <p className="text-sm text-niebla">{msjGpx}</p>}
        {track && <input type="hidden" name="recorrido" value={JSON.stringify(track)} />}
        {quitarRecorrido && <input type="hidden" name="quitar_recorrido" value="1" />}
      </section>

      {estado?.error && (
        <p role="alert" className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          <CircleAlert className="size-4" /> {estado.error}
        </p>
      )}

      <div className="flex justify-end gap-3">
        <Link href={jornada ? `/jornadas/${jornada.id}` : "/jornadas"} className="btn-ghost">
          Cancelar
        </Link>
        <button disabled={pendiente || !!estado?.ir} className="btn-primary min-w-36">
          {pendiente || estado?.ir ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
          {pendiente || estado?.ir ? "Guardando…" : "Guardar jornada"}
        </button>
      </div>
    </form>
  );
}
