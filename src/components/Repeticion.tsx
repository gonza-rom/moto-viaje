"use client";

// Repetición animada del viaje: la ruta se dibuja sobre el mapa, la cámara sigue a la moto
// y las fotos aparecen en el lugar (o el momento) en que se sacaron.

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, useMap } from "react-leaflet";
import { Check, Clapperboard, Download, Gauge, Images, LoaderCircle, Pause, Play, RotateCcw, Share2, X } from "lucide-react";
import { parseGpx, type Punto } from "@/lib/gpx";
import { kmAcumulados, reducir, ubicarEnRecorrido } from "@/lib/recorrido";
import { cldMiniatura, cldUrl } from "@/lib/cld";
import { formatoGrabacion, grabarVideo } from "@/lib/video-viaje";
import { fechaHoraFoto } from "@/lib/fotos";
import { textoLugar } from "@/lib/categorias";
import type { Foto, LugarRecorrido } from "@/lib/types";
import { CapasBase, MapaVacio, NARANJA } from "./mapa/base";

const DURACION_S = 30; // duración del recorrido a velocidad 1×, sin contar las pausas en las fotos
const PAUSA_FOTO_MS = 2600;

type FotoEnRuta = Foto & { km: number; aprox: boolean };

/** Ubica cada foto en un km del recorrido: GPS > lugar puesto > hora (proporcional entre la primera y la última) */
/** Fotos sin GPS ni lugar: se reparten por la hora, a lo largo de todo el viaje (8 h del primer día → 20 h del último) */
function ubicarFotos(
  fotos: Foto[],
  puntos: Punto[],
  acum: number[],
  lugares: LugarRecorrido[],
  fechaInicio: string,
  fechaFin: string | null
): FotoEnRuta[] {
  const total = acum[acum.length - 1];
  const tiempos = fotos.map((f) => (f.tomada_en ? Date.parse(f.tomada_en) : NaN)).filter(Number.isFinite);
  const t0 = Math.min(...tiempos, Date.parse(`${fechaInicio}T08:00:00`));
  const t1 = Math.max(...tiempos, Date.parse(`${fechaFin ?? fechaInicio}T20:00:00`));
  const out: FotoEnRuta[] = [];
  for (const f of fotos) {
    if (f.lat != null && f.lng != null) {
      const u = ubicarEnRecorrido([f.lat, f.lng], puntos, acum);
      if (u.desvio < 20) {
        out.push({ ...f, km: u.km, aprox: false });
        continue;
      }
    }
    const l = f.lugar ? lugares.find((x) => x.nombre.toLowerCase() === f.lugar!.toLowerCase()) : undefined;
    if (l) {
      out.push({ ...f, km: l.km, aprox: false });
      continue;
    }
    const t = f.tomada_en ? Date.parse(f.tomada_en) : NaN;
    if (Number.isFinite(t) && t1 > t0) out.push({ ...f, km: ((t - t0) / (t1 - t0)) * total, aprox: true });
  }
  // Orden del recorrido; a igual km, por hora
  return out.sort((a, b) => a.km - b.km || (a.tomada_en ?? "").localeCompare(b.tomada_en ?? ""));
}

/** Punto interpolado a una distancia km */
function puntoEn(km: number, puntos: Punto[], acum: number[]): { p: Punto; i: number } {
  let lo = 0;
  let hi = acum.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (acum[m] < km) lo = m + 1;
    else hi = m;
  }
  const i = Math.max(1, lo);
  const a = puntos[i - 1];
  const b = puntos[i];
  const tramo = acum[i] - acum[i - 1] || 1;
  const t = Math.min(1, Math.max(0, (km - acum[i - 1]) / tramo));
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], i };
}

export default function Repeticion({
  gpxUrl,
  trazo,
  fotos,
  lugares,
  fechaInicio,
  fechaFin,
  viajeId,
  titulo,
  subtitulo,
  datos,
}: {
  gpxUrl: string | null;
  trazo: Punto[] | null;
  fotos: Foto[];
  lugares: LugarRecorrido[];
  fechaInicio: string;
  fechaFin: string | null;
  /** Para recordar qué fotos elegiste y para el video */
  viajeId: string;
  titulo: string;
  subtitulo: string;
  datos: { valor: string; label: string }[];
}) {
  const [puntos, setPuntos] = useState<Punto[] | null>(trazo && trazo.length > 1 ? reducir(trazo, 2500) : null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (puntos || !gpxUrl) {
      if (!puntos && !gpxUrl) setError("Este viaje no tiene recorrido");
      return;
    }
    fetch(gpxUrl)
      .then((r) => r.text())
      .then((t) => {
        const p = parseGpx(t);
        if (p.length < 2) throw new Error();
        setPuntos(reducir(p, 2500));
      })
      .catch(() => setError("No se pudo cargar el recorrido"));
  }, [gpxUrl, puntos]);

  if (error) return <MapaVacio>{error}</MapaVacio>;
  if (!puntos) return <MapaVacio>Cargando recorrido…</MapaVacio>;
  return (
    <Reproductor
      puntos={puntos}
      fotos={fotos}
      lugares={lugares}
      fechaInicio={fechaInicio}
      fechaFin={fechaFin}
      viajeId={viajeId}
      titulo={titulo}
      subtitulo={subtitulo}
      datos={datos}
    />
  );
}

/** Por defecto: las favoritas; si no hay, hasta 8 repartidas a lo largo del recorrido */
function eleccionInicial(todas: FotoEnRuta[]): string[] {
  const favs = todas.filter((f) => f.favorita);
  if (favs.length) return favs.slice(0, 15).map((f) => f.id);
  if (todas.length <= 8) return todas.map((f) => f.id);
  return Array.from({ length: 8 }, (_, i) => todas[Math.round((i * (todas.length - 1)) / 7)].id);
}

function Reproductor({
  puntos,
  fotos,
  lugares,
  fechaInicio,
  fechaFin,
  viajeId,
  titulo,
  subtitulo,
  datos,
}: {
  puntos: Punto[];
  fotos: Foto[];
  lugares: LugarRecorrido[];
  fechaInicio: string;
  fechaFin: string | null;
  viajeId: string;
  titulo: string;
  subtitulo: string;
  datos: { valor: string; label: string }[];
}) {
  const acum = useMemo(() => kmAcumulados(puntos), [puntos]);
  const total = acum[acum.length - 1];
  const todas = useMemo(
    () => ubicarFotos(fotos.filter((f) => f.tipo !== "video"), puntos, acum, lugares, fechaInicio, fechaFin),
    [fotos, puntos, acum, lugares, fechaInicio, fechaFin]
  );

  // Fotos elegidas para la animación y el video (se recuerdan en este celular)
  const claveEleccion = `mv:repeticion:${viajeId}`;
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set(eleccionInicial(todas)));
  useEffect(() => {
    try {
      const guardadas = JSON.parse(localStorage.getItem(claveEleccion) ?? "null");
      if (Array.isArray(guardadas)) setElegidas(new Set(guardadas.filter((id) => todas.some((f) => f.id === id))));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function cambiarEleccion(ids: string[]) {
    setElegidas(new Set(ids));
    localStorage.setItem(claveEleccion, JSON.stringify(ids));
    setJugando(false);
    estado.current = { km: 0, siguienteFoto: 0, pausaHasta: 0, ultimo: performance.now() };
    setKm(0);
    setFoto(null);
  }
  const enRuta = useMemo(() => todas.filter((f) => elegidas.has(f.id)), [todas, elegidas]);
  const [panel, setPanel] = useState<"fotos" | "video" | null>(null);

  const [km, setKm] = useState(0);
  const [jugando, setJugando] = useState(false);
  const [velocidad, setVelocidad] = useState(1);
  const [foto, setFoto] = useState<FotoEnRuta | null>(null);
  const estado = useRef({ km: 0, siguienteFoto: 0, pausaHasta: 0, ultimo: 0 });

  // Bucle de animación
  useEffect(() => {
    if (!jugando) return;
    let raf = 0;
    estado.current.ultimo = performance.now();
    const paso = (ahora: number) => {
      const e = estado.current;
      const dt = ahora - e.ultimo;
      e.ultimo = ahora;
      if (ahora >= e.pausaHasta) {
        if (e.pausaHasta) {
          e.pausaHasta = 0;
          setFoto(null);
        }
        e.km = Math.min(total, e.km + (total / (DURACION_S * 1000)) * dt * velocidad);
        const f = enRuta[e.siguienteFoto];
        if (f && e.km >= f.km) {
          e.km = f.km;
          e.siguienteFoto++;
          e.pausaHasta = ahora + PAUSA_FOTO_MS / velocidad;
          setFoto(f);
        }
        setKm(e.km);
        if (e.km >= total && e.siguienteFoto >= enRuta.length) {
          setJugando(false);
          return;
        }
      }
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [jugando, velocidad, total, enRuta]);

  // Precargar las próximas fotos para que aparezcan ya cargadas
  const proxima = enRuta.findIndex((f) => f.km > km);
  useEffect(() => {
    if (proxima < 0) return;
    for (const f of enRuta.slice(proxima, proxima + 3)) new Image().src = cldMiniatura(f, { w: 700 });
  }, [proxima, enRuta]);
  useEffect(() => {
    for (const f of enRuta.slice(0, 3)) new Image().src = cldMiniatura(f, { w: 700 });
  }, [enRuta]);

  function reiniciar() {
    estado.current = { km: 0, siguienteFoto: 0, pausaHasta: 0, ultimo: performance.now() };
    setKm(0);
    setFoto(null);
    setJugando(true);
  }

  // Lugar y día actuales
  const lugar = [...lugares].reverse().find((l) => l.km <= km + 0.5);
  const ultimaFoto = [...enRuta].reverse().find((f) => f.km <= km && f.tomada_en);
  const dia = ultimaFoto?.tomada_en
    ? Math.round((Date.parse(ultimaFoto.tomada_en.slice(0, 10)) - Date.parse(fechaInicio)) / 86400000) + 1
    : 1;
  const terminado = km >= total && !jugando;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setPanel("fotos")} className="btn-ghost py-2">
          <Images className="size-4" /> Fotos ({enRuta.length} de {todas.length})
        </button>
        <button type="button" onClick={() => (setJugando(false), setPanel("video"))} className="btn-primary py-2">
          <Clapperboard className="size-4" /> Video para redes
        </button>
      </div>
    <div className="relative h-[calc(100dvh-20rem)] min-h-96 overflow-hidden rounded-2xl border border-linea md:h-[70dvh]">
      <MapContainer center={puntos[0]} zoom={10} zoomControl={false} attributionControl className="size-full" scrollWheelZoom={false}>
        <CapasBase />
        <Trazo puntos={puntos} acum={acum} km={km} seguir={jugando} />
      </MapContainer>

      {/* Datos arriba */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex items-start justify-between gap-2">
        <div className="rounded-xl bg-black/70 px-3 py-2 backdrop-blur">
          <p className="font-display text-2xl leading-none font-bold">{Math.round(km)} km</p>
          <p className="text-xs text-white/70">
            Día {Math.max(1, dia)}
            {lugar ? ` · ${lugar.nombre}` : ""}
          </p>
        </div>
      </div>

      {/* Foto actual */}
      {foto && (
        <div className="pointer-events-none absolute inset-x-3 bottom-20 z-[500] mx-auto max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-black/80 shadow-2xl backdrop-blur">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cldMiniatura(foto, { w: 700 })}
            alt={foto.caption ?? ""}
            style={foto.width && foto.height ? { aspectRatio: `${foto.width} / ${foto.height}` } : undefined}
            className="max-h-[34dvh] w-full bg-grafito object-cover"
          />
          <div className="space-y-0.5 px-3 py-2 text-xs">
            {foto.caption && <p className="text-sm text-white">{foto.caption}</p>}
            <p className="text-white/60">
              {[foto.tomada_en ? fechaHoraFoto(foto.tomada_en) : null, textoLugar(foto) || null].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      )}

      {/* Controles */}
      <div className="absolute inset-x-3 bottom-3 z-[500] flex items-center gap-2">
        <button
          type="button"
          onClick={() => (terminado || km === 0 ? reiniciar() : setJugando((j) => !j))}
          className="btn-primary px-4"
          aria-label={jugando ? "Pausar" : "Reproducir"}
        >
          {jugando ? <Pause className="size-4" /> : <Play className="size-4" />}
          {jugando ? "Pausa" : terminado ? "De nuevo" : km === 0 ? "Reproducir" : "Seguir"}
        </button>
        {km > 0 && !terminado && (
          <button type="button" onClick={reiniciar} className="btn-ghost bg-black/60 px-3" aria-label="Empezar de nuevo">
            <RotateCcw className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setVelocidad((v) => (v === 1 ? 2 : v === 2 ? 4 : 1))}
          className="btn-ghost ml-auto bg-black/60 px-3 text-xs"
          aria-label="Velocidad"
        >
          <Gauge className="size-4" /> {velocidad}×
        </button>
        {/* Barra de progreso */}
        <div className="absolute -top-2 right-0 left-0 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-naranja" style={{ width: `${(km / total) * 100}%` }} />
        </div>
      </div>

      {enRuta.some((f) => f.aprox) && (
        <p className="pointer-events-none absolute right-3 bottom-16 z-[400] text-[10px] text-white/50">
          Fotos sin GPS ubicadas por su hora (aprox.)
        </p>
      )}
    </div>

      {panel === "fotos" && (
        <ElegirFotos
          todas={todas}
          elegidas={elegidas}
          onListo={(ids) => {
            cambiarEleccion(ids);
            setPanel(null);
          }}
          onCerrar={() => setPanel(null)}
        />
      )}
      {panel === "video" && (
        <PanelVideo
          puntos={puntos}
          fotos={enRuta}
          lugares={lugares}
          titulo={titulo}
          subtitulo={subtitulo}
          datos={datos}
          onCerrar={() => setPanel(null)}
        />
      )}
    </div>
  );
}

/** Elegir qué fotos aparecen en la animación y en el video */
function ElegirFotos({
  todas,
  elegidas: inicial,
  onListo,
  onCerrar,
}: {
  todas: FotoEnRuta[];
  elegidas: Set<string>;
  onListo: (ids: string[]) => void;
  onCerrar: () => void;
}) {
  const [sel, setSel] = useState(new Set(inicial));
  const alternar = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const favs = todas.filter((f) => f.favorita).map((f) => f.id);
  const segundos = Math.round(20 + sel.size * 2.4);

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/80 sm:items-center" onClick={onCerrar}>
      <div className="card flex max-h-[90dvh] w-full max-w-2xl flex-col gap-3 rounded-b-none p-4 sm:rounded-b-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-2xl font-bold uppercase">Elegí las fotos</h2>
          <span className="text-sm text-niebla">
            {sel.size} de {todas.length} · video de ~{segundos} s
          </span>
          <button type="button" onClick={onCerrar} className="btn-ghost ml-auto px-2.5 py-1.5" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <button type="button" onClick={() => setSel(new Set(todas.map((f) => f.id)))} className="rounded-full border border-linea px-3 py-1">
            Todas
          </button>
          {favs.length > 0 && (
            <button type="button" onClick={() => setSel(new Set(favs))} className="rounded-full border border-linea px-3 py-1">
              Solo favoritas ({favs.length})
            </button>
          )}
          <button type="button" onClick={() => setSel(new Set(eleccionInicial(todas)))} className="rounded-full border border-linea px-3 py-1">
            Una selección (8)
          </button>
          <button type="button" onClick={() => setSel(new Set())} className="rounded-full border border-linea px-3 py-1">
            Ninguna
          </button>
        </div>
        <ul className="grid min-h-0 grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4">
          {todas.map((f) => {
            const si = sel.has(f.id);
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => alternar(f.id)}
                  aria-pressed={si}
                  className={`relative block aspect-square w-full overflow-hidden rounded-lg ${si ? "ring-3 ring-naranja" : "opacity-60"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cldMiniatura(f, { w: 300, h: 300, crop: "fill" })} alt="" className="size-full object-cover" loading="lazy" />
                  <span
                    className={`absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full border-2 ${
                      si ? "border-naranja bg-naranja text-black" : "border-white/80 bg-black/40"
                    }`}
                  >
                    {si && <Check className="size-4" strokeWidth={3} />}
                  </span>
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pt-4 pb-1 text-left text-[10px] text-white">
                    km {Math.round(f.km)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={() => onListo(todas.filter((f) => sel.has(f.id)).map((f) => f.id))} className="btn-primary">
          Listo ({sel.size})
        </button>
      </div>
    </div>
  );
}

/** Generar el video para redes (vertical o cuadrado) y compartirlo o descargarlo */
function PanelVideo({
  puntos,
  fotos,
  lugares,
  titulo,
  subtitulo,
  datos,
  onCerrar,
}: {
  puntos: Punto[];
  fotos: FotoEnRuta[];
  lugares: LugarRecorrido[];
  titulo: string;
  subtitulo: string;
  datos: { valor: string; label: string }[];
  onCerrar: () => void;
}) {
  const [formato, setFormato] = useState<"vertical" | "cuadrado">("vertical");
  const [estado, setEstado] = useState<{ p: number; fase: string } | null>(null);
  const [video, setVideo] = useState<{ url: string; file: File } | null>(null);
  const [error, setError] = useState("");
  const [puedeCompartir, setPuedeCompartir] = useState(false);
  const soporte = useMemo(() => formatoGrabacion(), []);

  useEffect(
    () => () => {
      if (video) URL.revokeObjectURL(video.url);
    },
    [video]
  );

  async function generar() {
    setError("");
    setVideo(null);
    try {
      const r = await grabarVideo(
        {
          puntos,
          fotos: fotos.map((f) => ({ url: cldUrl(f.public_id, { w: 1080, dpr: false }).replace("f_auto", "f_jpg"), km: f.km, texto: f.caption || textoLugar(f) || undefined })),
          lugares,
          titulo,
          subtitulo,
          datos,
          formato,
        },
        (p, fase) => setEstado({ p, fase })
      );
      const nombre = `${titulo.normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase().slice(0, 50) || "viaje"}.${r.ext}`;
      const file = new File([r.blob], nombre, { type: r.blob.type });
      setVideo({ url: URL.createObjectURL(r.blob), file });
      setPuedeCompartir(!!navigator.canShare?.({ files: [file] }));
    } catch (e) {
      setError((e as Error).message || "No se pudo generar el video");
    } finally {
      setEstado(null);
    }
  }

  async function compartir() {
    if (!video) return;
    try {
      await navigator.share({ files: [video.file], title: titulo });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("No se pudo compartir. Probá con Descargar.");
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/80 sm:items-center" onClick={() => !estado && onCerrar()}>
      <div className="card flex max-h-[92dvh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-b-none p-4 sm:rounded-b-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-2xl font-bold uppercase">Video para redes</h2>
          {!estado && (
            <button type="button" onClick={onCerrar} className="btn-ghost ml-auto px-2.5 py-1.5" aria-label="Cerrar">
              <X className="size-4" />
            </button>
          )}
        </div>

        {!soporte ? (
          <p className="text-sm text-amber-200">Este navegador no puede grabar video. Abrí la app en Chrome.</p>
        ) : video ? (
          <>
            <video src={video.url} controls playsInline className={`mx-auto max-h-[60dvh] rounded-xl bg-black ${formato === "vertical" ? "aspect-[9/16]" : "aspect-square"}`} />
            <div className="flex gap-2">
              {puedeCompartir && (
                <button type="button" onClick={compartir} className="btn-primary flex-1">
                  <Share2 className="size-4" /> Compartir
                </button>
              )}
              <a href={video.url} download={video.file.name} className={puedeCompartir ? "btn-ghost" : "btn-primary flex-1"}>
                <Download className="size-4" /> Descargar
              </a>
            </div>
            {soporte.ext === "webm" && (
              <p className="text-xs text-niebla">
                Este navegador lo graba en WebM: WhatsApp y YouTube lo aceptan; para Instagram puede hacer falta convertirlo a MP4.
              </p>
            )}
            <button type="button" onClick={() => setVideo(null)} className="text-xs text-niebla underline">
              Hacer otro
            </button>
          </>
        ) : estado ? (
          <div className="space-y-2 py-4">
            <p className="flex items-center gap-2 text-sm">
              <LoaderCircle className="size-4 animate-spin text-naranja" /> {estado.fase}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-naranja transition-[width]" style={{ width: `${Math.round(estado.p * 100)}%` }} />
            </div>
            <p className="text-xs text-niebla">Se graba en tiempo real: no cambies de app ni apagues la pantalla hasta que termine.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["vertical", "Vertical", "Historias y Reels (9:16)"],
                  ["cuadrado", "Cuadrado", "Publicación (1:1)"],
                ] as const
              ).map(([k, label, desc]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFormato(k)}
                  className={`rounded-xl border p-3 text-left ${formato === k ? "border-naranja bg-naranja/10" : "border-linea"}`}
                >
                  <span className="block font-semibold">{label}</span>
                  <span className="text-xs text-niebla">{desc}</span>
                </button>
              ))}
            </div>
            <p className="text-sm text-niebla">
              {fotos.length} {fotos.length === 1 ? "foto" : "fotos"} · unos {Math.round(20 + fotos.length * 2.4)} segundos. Mapa satelital, la ruta que avanza,
              tus fotos y al final los datos del viaje.
            </p>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="button" onClick={generar} className="btn-primary">
              <Clapperboard className="size-4" /> Generar video
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Dibuja el recorrido hecho y la moto (Leaflet directo: actualizar React en cada cuadro sería lento) */
function Trazo({ puntos, acum, km, seguir }: { puntos: Punto[]; acum: number[]; km: number; seguir: boolean }) {
  const map = useMap();
  const capas = useRef<{ fondo: L.Polyline; hecho: L.Polyline; moto: L.CircleMarker } | null>(null);

  useEffect(() => {
    const fondo = L.polyline(puntos, { color: "#ffffff", weight: 3, opacity: 0.35, dashArray: "4 6" }).addTo(map);
    const hecho = L.polyline([], { color: NARANJA, weight: 5, opacity: 0.95 }).addTo(map);
    const moto = L.circleMarker(puntos[0], { radius: 8, color: "#fff", weight: 3, fillColor: NARANJA, fillOpacity: 1 }).addTo(map);
    capas.current = { fondo, hecho, moto };
    map.fitBounds(fondo.getBounds(), { padding: [30, 30] });
    return () => {
      fondo.remove();
      hecho.remove();
      moto.remove();
    };
  }, [map, puntos]);

  useEffect(() => {
    const c = capas.current;
    if (!c) return;
    const { p, i } = puntoEn(km, puntos, acum);
    c.hecho.setLatLngs([...puntos.slice(0, i), p]);
    c.moto.setLatLng(p);
    if (seguir) {
      if (map.getZoom() < 10) map.setZoom(10, { animate: false });
      map.panTo(p, { animate: false });
    }
  }, [km, puntos, acum, seguir, map]);

  return null;
}
