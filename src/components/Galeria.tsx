"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Calendar,
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  Film,
  Heart,
  Images,
  MapPin,
  Play,
  X,
} from "lucide-react";
import { cldMiniatura, cldOriginal, cldPoster, cldSrcSet, cldUrl, cldVideo, duracionTxt } from "@/lib/cld";
import { agruparPorDia, fechaHoraFoto, linkMapa, type Grupo } from "@/lib/fotos";
import { rangoFechas } from "@/lib/format";
import { marcarFavorita } from "@/app/actions";
import type { Foto, FotoConViaje } from "@/lib/types";

type Item = Foto & { viajes?: FotoConViaje["viajes"] };
type Filtro = "todo" | "fotos" | "videos" | "favs";

/** Evento para abrir una foto desde afuera (p. ej. un marcador del mapa) */
export const EVENTO_ABRIR_FOTO = "mv:abrir-foto";

export function Galeria({
  fotos,
  titulo,
  agrupar = "dia",
  fechaInicio,
}: {
  fotos: Item[];
  titulo?: string;
  /** dia: Día 1, Día 2… (según la fecha de la foto) · viaje: por viaje (galería general) */
  agrupar?: "dia" | "viaje" | "nada";
  fechaInicio?: string;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todo");
  const [favs, setFavs] = useState<Record<string, boolean>>({});
  const [abierta, setAbierta] = useState<string | null>(null);
  const [touchX, setTouchX] = useState<number | null>(null);

  const esFav = useCallback((f: Item) => favs[f.id] ?? f.favorita ?? false, [favs]);

  const cuentas = useMemo(() => {
    const videos = fotos.filter((f) => f.tipo === "video").length;
    return { todo: fotos.length, fotos: fotos.length - videos, videos, favs: fotos.filter(esFav).length };
  }, [fotos, esFav]);

  const grupos: Grupo<Item>[] = useMemo(() => {
    const visibles = fotos.filter((f) =>
      filtro === "fotos" ? f.tipo !== "video" : filtro === "videos" ? f.tipo === "video" : filtro === "favs" ? esFav(f) : true
    );
    if (agrupar === "dia" && fechaInicio) return agruparPorDia(visibles, fechaInicio);
    if (agrupar === "viaje") {
      const mapa = new Map<string, Grupo<Item>>();
      for (const f of visibles) {
        const v = f.viajes;
        if (!mapa.has(f.viaje_id)) {
          mapa.set(f.viaje_id, {
            clave: f.viaje_id,
            titulo: v?.titulo ?? "Viaje",
            subtitulo: v ? rangoFechas(v.fecha_inicio, v.fecha_fin) : undefined,
            items: [],
          });
        }
        mapa.get(f.viaje_id)!.items.push(f);
      }
      return [...mapa.values()];
    }
    return [{ clave: "todo", titulo: "", items: visibles }];
  }, [fotos, filtro, agrupar, fechaInicio, esFav]);

  // Orden de navegación del visor = orden en pantalla
  const lista = useMemo(() => grupos.flatMap((g) => g.items), [grupos]);
  const idx = abierta ? lista.findIndex((f) => f.id === abierta) : -1;
  const actual = idx >= 0 ? lista[idx] : null;

  const cerrar = useCallback(() => setAbierta(null), []);
  const mover = useCallback(
    (d: number) => {
      if (idx < 0) return;
      setAbierta(lista[(idx + d + lista.length) % lista.length].id);
    },
    [idx, lista]
  );

  async function alternarFav(f: Item) {
    const nuevo = !esFav(f);
    setFavs((x) => ({ ...x, [f.id]: nuevo }));
    const r = await marcarFavorita(f.id, nuevo).catch(() => ({ error: "Sin conexión" }));
    if (r?.error) {
      setFavs((x) => ({ ...x, [f.id]: !nuevo }));
      alert(r.error);
    }
  }

  // Abrir desde el mapa
  useEffect(() => {
    const h = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (fotos.some((f) => f.id === id)) {
        setFiltro("todo");
        setAbierta(id);
      }
    };
    window.addEventListener(EVENTO_ABRIR_FOTO, h);
    return () => window.removeEventListener(EVENTO_ABRIR_FOTO, h);
  }, [fotos]);

  useEffect(() => {
    if (!actual) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
      if (e.key === "ArrowRight") mover(1);
      if (e.key === "ArrowLeft") mover(-1);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [actual, cerrar, mover]);

  if (!fotos.length) return null;

  const chips: { k: Filtro; label: string; icono: typeof Images; n: number }[] = [
    { k: "todo", label: "Todo", icono: Images, n: cuentas.todo },
    { k: "fotos", label: "Fotos", icono: Camera, n: cuentas.fotos },
    { k: "videos", label: "Videos", icono: Film, n: cuentas.videos },
    { k: "favs", label: "Favoritas", icono: Heart, n: cuentas.favs },
  ];
  // Mostrar filtros solo si sirven para algo
  const conFiltros = (cuentas.videos > 0 && cuentas.fotos > 0) || cuentas.favs > 0;

  return (
    <div className="space-y-5">
      {conFiltros && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
          {chips
            .filter((c) => c.k === "todo" || c.n > 0)
            .map(({ k, label, icono: Icono, n }) => (
              <button
                key={k}
                type="button"
                onClick={() => setFiltro(k)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  filtro === k ? "border-naranja bg-naranja text-black" : "border-linea text-niebla hover:text-white"
                }`}
              >
                <Icono className="size-3.5" /> {label} <span className="opacity-70">{n}</span>
              </button>
            ))}
        </div>
      )}

      {!lista.length && <p className="py-6 text-center text-sm text-niebla">No hay nada con ese filtro.</p>}

      {grupos.map((g) => (
        <section key={g.clave} className="space-y-3">
          {g.titulo && (
            <div className="flex items-baseline gap-2 border-b border-linea pb-1.5">
              {agrupar === "viaje" ? (
                <Link href={`/viajes/${g.clave}`} className="group flex items-center gap-1.5 font-semibold hover:text-naranja">
                  {g.titulo} <ArrowRight className="size-4 opacity-0 transition group-hover:opacity-100" />
                </Link>
              ) : (
                <h3 className="font-display text-xl font-bold uppercase">{g.titulo}</h3>
              )}
              {g.subtitulo && <span className="text-xs text-niebla">{g.subtitulo}</span>}
              <span className="ml-auto text-xs text-niebla">{g.items.length}</span>
            </div>
          )}
          <div className="columns-2 gap-2 sm:columns-3 lg:columns-4">
            {g.items.map((f) => (
              <button
                key={f.id}
                onClick={() => setAbierta(f.id)}
                className="group relative mb-2 block w-full overflow-hidden rounded-xl bg-grafito focus:ring-2 focus:ring-naranja focus:outline-none"
              >
                {f.tipo === "video" && (
                  <span className="pointer-events-none absolute inset-0 grid place-items-center">
                    <span className="grid size-12 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm">
                      <Play className="ml-0.5 size-5 fill-current" />
                    </span>
                    {f.duracion && (
                      <span className="absolute right-2 bottom-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white">
                        {duracionTxt(f.duracion)}
                      </span>
                    )}
                  </span>
                )}
                {esFav(f) && (
                  <Heart className="pointer-events-none absolute top-2 left-2 size-4 fill-red-500 text-red-500 drop-shadow" />
                )}
                <img
                  src={cldMiniatura(f, { w: 600 })}
                  alt={f.caption || titulo || ""}
                  width={f.width ?? undefined}
                  height={f.height ?? undefined}
                  loading="lazy"
                  className="h-auto w-full transition duration-300 group-hover:opacity-85"
                />
                {f.caption && (
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/80 to-transparent px-2 pt-6 pb-1.5 text-left text-[11px] text-white/90">
                    {f.caption}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      ))}

      {/* Visor */}
      {actual && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/95"
          onClick={cerrar}
          onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX === null) return;
            const dx = e.changedTouches[0].clientX - touchX;
            if (Math.abs(dx) > 50) mover(dx < 0 ? 1 : -1);
            setTouchX(null);
          }}
        >
          <div className="flex items-center justify-between gap-2 p-4 pt-[max(1rem,env(safe-area-inset-top))] text-sm text-niebla">
            <span>
              {idx + 1} / {lista.length}
            </span>
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => alternarFav(actual)}
                className={`btn-ghost px-3 py-1.5 ${esFav(actual) ? "text-red-400" : ""}`}
                title={esFav(actual) ? "Quitar de favoritas" : "Marcar como favorita"}
              >
                <Heart className={`size-4 ${esFav(actual) ? "fill-current" : ""}`} />
              </button>
              <a href={cldOriginal(actual)} className="btn-ghost px-3 py-1.5" title="Descargar original">
                <Download className="size-4" />
                <span className="hidden sm:inline">Original</span>
              </a>
              <button onClick={cerrar} className="btn-ghost px-3 py-1.5" title="Cerrar">
                <X className="size-4" />
              </button>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
            {actual.tipo === "video" ? (
              <video
                key={actual.id}
                src={cldVideo(actual.public_id)}
                poster={cldPoster(actual.public_id, { w: 1280 })}
                controls
                autoPlay
                playsInline
                className="max-h-full max-w-full rounded-lg bg-black"
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
              />
            ) : (
              <img
                key={actual.id}
                src={cldUrl(actual.public_id, { w: 1600 })}
                srcSet={cldSrcSet(actual.public_id)}
                sizes="100vw"
                alt={actual.caption || titulo || ""}
                className="max-h-full max-w-full rounded-lg object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            )}
            {lista.length > 1 && (
              <>
                <button
                  onClick={(e) => (e.stopPropagation(), mover(-1))}
                  className="absolute left-3 hidden size-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:grid"
                  title="Anterior"
                >
                  <ChevronLeft className="size-6" />
                </button>
                <button
                  onClick={(e) => (e.stopPropagation(), mover(1))}
                  className="absolute right-3 hidden size-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:grid"
                  title="Siguiente"
                >
                  <ChevronRight className="size-6" />
                </button>
              </>
            )}
          </div>

          {/* Datos de la foto */}
          <div
            className="space-y-1.5 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {actual.caption && <p className="text-sm text-white/90">{actual.caption}</p>}
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-niebla">
              {actual.viajes && (
                <Link href={`/viajes/${actual.viaje_id}`} className="flex items-center gap-1 text-white/80 hover:text-naranja">
                  {actual.viajes.titulo} <ArrowRight className="size-3" />
                </Link>
              )}
              {actual.tomada_en && (
                <span className="flex items-center gap-1">
                  <Calendar className="size-3.5" /> {fechaHoraFoto(actual.tomada_en)}
                </span>
              )}
              {actual.lat != null && actual.lng != null && (
                <a
                  href={linkMapa(actual.lat, actual.lng)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-white"
                >
                  <MapPin className="size-3.5" /> Ver dónde fue
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
