"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, useMapEvents } from "react-leaflet";
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  LoaderCircle,
  LocateFixed,
  MousePointerClick,
  Route,
  Ruler,
  Search,
  Trash2,
  Undo2,
  Waypoints,
  X,
} from "lucide-react";
import type { Punto } from "@/lib/gpx";
import { MAX_PARADAS, buscarLugar, nombrarLugar, trazarRuta, type ModoRuta, type Parada, type Ruta } from "@/lib/ruta";
import { CapasBase, Encuadrar, NARANJA, iconoParada, tipoParada } from "./mapa/base";

const CENTRO_AR: [number, number] = [-34.6, -64.5];

const dist = (a: Parada, b: Parada) => Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180));

/** Inserta la parada donde menos desvío agrega (al final, o entre dos existentes) */
function insertarInteligente(paradas: Parada[], p: Parada): Parada[] {
  if (paradas.length < 2) return [...paradas, p];
  let mejor = paradas.length;
  let costo = dist(paradas[paradas.length - 1], p);
  for (let i = 0; i < paradas.length - 1; i++) {
    const c = dist(paradas[i], p) + dist(p, paradas[i + 1]) - dist(paradas[i], paradas[i + 1]);
    if (c < costo) {
      costo = c;
      mejor = i + 1;
    }
  }
  return [...paradas.slice(0, mejor), p, ...paradas.slice(mejor)];
}

function ClickMapa({ onClick }: { onClick: (p: Parada) => void }) {
  useMapEvents({ click: (e) => onClick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

export default function EditorRuta({
  inicial,
  origen,
  destino,
  referencia,
  onChange,
}: {
  inicial: Ruta | null;
  origen: string;
  destino: string;
  /** Track GPX para mostrar de fondo mientras se traza */
  referencia?: Punto[];
  onChange: (r: Ruta | null) => void;
}) {
  const [paradas, setParadas] = useState<Parada[]>(inicial?.paradas ?? []);
  const [modo, setModo] = useState<ModoRuta>(inicial?.modo ?? "calle");
  const [trazo, setTrazo] = useState<Punto[]>(inicial?.trazo ?? []);
  const [km, setKm] = useState<number>(inicial?.km ?? 0);
  const [calculando, setCalculando] = useState(false);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [encuadre, setEncuadre] = useState(0);

  const primera = useRef(true);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Recalcular el trazo solo cuando cambian las coordenadas o el modo (no al ponerles nombre)
  const claveCoords = paradas.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(";");
  const paradasRef = useRef(paradas);
  paradasRef.current = paradas;
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      if (inicial) return; // ya viene calculado de la DB
    }
    setError("");
    if (paradas.length < 2) {
      setTrazo([]);
      setKm(0);
      onChangeRef.current(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setCalculando(true);
      try {
        const r = await trazarRuta(paradasRef.current, modo, ctrl.signal);
        setTrazo(r.trazo);
        setKm(r.km);
        onChangeRef.current(r);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        if (!ctrl.signal.aborted) setCalculando(false);
      }
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveCoords, modo]);

  // Cuando llegan los nombres de lugares, avisar al formulario sin recalcular el trazo
  const claveNombres = paradas.map((p) => `${p.nombre ?? ""}|${p.provincia ?? ""}`).join(";");
  const nombresIniciales = useRef(claveNombres);
  useEffect(() => {
    if (claveNombres === nombresIniciales.current) return;
    if (paradas.length >= 2 && trazo.length > 1 && !calculando) onChangeRef.current({ modo, paradas, trazo, km });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveNombres]);

  /** Pone nombre, provincia y país a una parada marcada tocando el mapa */
  function nombrar(p: Parada) {
    nombrarLugar(p.lat, p.lng).then((l) => {
      if (!l) return;
      setParadas((ps) =>
        ps.map((x) => (x.lat === p.lat && x.lng === p.lng ? { ...x, nombre: x.nombre ?? l.nombre, provincia: l.provincia, pais: l.pais } : x))
      );
    });
  }

  const agregar = (p: Parada, encuadrar = false) => {
    if (paradas.length >= MAX_PARADAS) return setError(`Máximo ${MAX_PARADAS} paradas`);
    setParadas((ps) => insertarInteligente(ps, p));
    if (encuadrar) setEncuadre((n) => n + 1);
    if (!p.provincia) nombrar(p);
  };

  async function buscar() {
    const q = busqueda.trim();
    if (!q) return;
    setBuscando(true);
    setError("");
    try {
      const p = await buscarLugar(q);
      if (!p) setError(`No encontré "${q}"`);
      else {
        agregar(p, true);
        setBusqueda("");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuscando(false);
    }
  }

  function miUbicacion() {
    if (!("geolocation" in navigator)) return setError("Este dispositivo no da la ubicación");
    setBuscando(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBuscando(false);
        agregar({ lat: pos.coords.latitude, lng: pos.coords.longitude, nombre: "Mi ubicación" }, true);
      },
      () => {
        setBuscando(false);
        setError("No se pudo obtener tu ubicación (¿permiso denegado?)");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function desdeHasta() {
    setBuscando(true);
    setError("");
    try {
      const o = await buscarLugar(origen);
      // Nominatim pide máx. 1 request por segundo
      await new Promise((r) => setTimeout(r, 1100));
      const d = await buscarLugar(destino);
      if (!o || !d) throw new Error(`No encontré ${!o ? `"${origen}"` : `"${destino}"`}`);
      setParadas([o, d]);
      setEncuadre((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuscando(false);
    }
  }

  const mover = (i: number, d: number) =>
    setParadas((ps) => {
      const j = i + d;
      if (j < 0 || j >= ps.length) return ps;
      const c = [...ps];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  const quitar = (i: number) => setParadas((ps) => ps.filter((_, j) => j !== i));

  const encuadrables = (
    paradas.length ? [...paradas.map((p) => [p.lat, p.lng]), ...trazo] : referencia ?? []
  ) as [number, number][];

  return (
    <div className="space-y-3">
      {/* Barra de herramientas */}
      <div className="flex flex-wrap gap-2">
        <div className="flex min-w-56 flex-1 gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                buscar();
              }
            }}
            placeholder="Buscar lugar y agregarlo como parada…"
            className="input"
          />
          <button type="button" onClick={buscar} disabled={buscando || !busqueda.trim()} className="btn-ghost px-3" title="Buscar">
            {buscando ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
          </button>
        </div>
        <button type="button" onClick={miUbicacion} disabled={buscando} className="btn-ghost px-3" title="Agregar mi ubicación">
          <LocateFixed className="size-4" />
        </button>
        {origen.trim() && destino.trim() && (
          <button type="button" onClick={desdeHasta} disabled={buscando} className="btn-ghost">
            <Waypoints className="size-4" /> Desde → Hasta
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-linea p-0.5">
          {(
            [
              ["calle", Route, "Por rutas"],
              ["recta", Ruler, "Línea recta"],
            ] as const
          ).map(([m, Icono, txt]) => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                modo === m ? "bg-naranja text-black" : "text-niebla hover:text-white"
              }`}
            >
              <Icono className="size-3.5" /> {txt}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setParadas((ps) => ps.slice(0, -1))}
          disabled={!paradas.length}
          className="btn-ghost px-3 py-1.5 text-xs"
        >
          <Undo2 className="size-3.5" /> Deshacer
        </button>
        <button
          type="button"
          onClick={() => setParadas([])}
          disabled={!paradas.length}
          className="btn-ghost px-3 py-1.5 text-xs text-red-400"
        >
          <Trash2 className="size-3.5" /> Borrar ruta
        </button>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-niebla">
          {calculando ? (
            <>
              <LoaderCircle className="size-3.5 animate-spin" /> Calculando…
            </>
          ) : error ? (
            <span className="flex items-center gap-1.5 text-red-400">
              <CircleAlert className="size-3.5" /> {error}
            </span>
          ) : km ? (
            <span className="font-semibold text-white">{km.toLocaleString("es-AR")} km</span>
          ) : (
            <>
              <MousePointerClick className="size-3.5" /> Tocá el mapa para marcar paradas
            </>
          )}
        </span>
      </div>

      {/* Mapa */}
      <div className="h-80 overflow-hidden rounded-xl border border-linea md:h-96">
        <MapContainer center={CENTRO_AR} zoom={4} scrollWheelZoom className="size-full cursor-crosshair">
          <CapasBase />
          <ClickMapa onClick={(p) => agregar(p)} />
          <Encuadrar puntos={encuadrables} clave={encuadre} />
          {referencia && referencia.length > 1 && (
            <Polyline positions={referencia} pathOptions={{ color: "#ffffff", weight: 2, opacity: 0.45, dashArray: "4 6" }} />
          )}
          {trazo.length > 1 && (
            <Polyline positions={trazo} pathOptions={{ color: NARANJA, weight: 4, opacity: calculando ? 0.4 : 0.95 }} />
          )}
          {paradas.map((p, i) => (
            <Marker
              key={`${i}-${p.lat}-${p.lng}`}
              position={[p.lat, p.lng]}
              icon={iconoParada(i + 1, tipoParada(i, paradas.length))}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const { lat, lng } = e.target.getLatLng();
                  setParadas((ps) => ps.map((x, j) => (j === i ? { lat, lng } : x)));
                  nombrar({ lat, lng });
                },
              }}
            >
              <Popup>
                <div className="space-y-2 text-sm">
                  <p className="font-semibold">{p.nombre || `Parada ${i + 1}`}</p>
                  <button type="button" onClick={() => quitar(i)} className="text-red-500 underline">
                    Quitar parada
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Lista de paradas */}
      {paradas.length > 0 && (
        <ol className="divide-y divide-linea overflow-hidden rounded-xl border border-linea text-sm">
          {paradas.map((p, i) => (
            <li key={`${i}-${p.lat}-${p.lng}`} className="flex items-center gap-3 px-3 py-2">
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                  i === 0 ? "bg-green-500 text-black" : i === paradas.length - 1 && i > 0 ? "bg-red-500 text-white" : "bg-grafito"
                }`}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {p.nombre || <span className="text-niebla">{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</span>}
              </span>
              <div className="flex gap-1">
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="grid size-7 place-items-center rounded-md text-niebla hover:bg-grafito hover:text-white disabled:opacity-30" title="Subir">
                  <ArrowUp className="size-3.5" />
                </button>
                <button type="button" onClick={() => mover(i, 1)} disabled={i === paradas.length - 1} className="grid size-7 place-items-center rounded-md text-niebla hover:bg-grafito hover:text-white disabled:opacity-30" title="Bajar">
                  <ArrowDown className="size-3.5" />
                </button>
                <button type="button" onClick={() => quitar(i)} className="grid size-7 place-items-center rounded-md text-red-400 hover:bg-grafito" title="Quitar">
                  <X className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-niebla">
        Las paradas nuevas se insertan donde menos desvío agregan. Arrastrá un marcador para moverlo. Rutas calculadas
        con OpenStreetMap (OSRM).
      </p>
    </div>
  );
}
