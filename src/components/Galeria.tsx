"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Calendar,
  Camera,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Download,
  Film,
  Heart,
  Images,
  MapPin,
  Tag,
  Play,
  Star,
  X,
} from "lucide-react";
import { cldMiniatura, cldOriginal, cldPoster, cldSrcSet, cldUrl, cldVideo, duracionTxt } from "@/lib/cld";
import { agruparPorDia, fechaHoraFoto, linkMapa, type Grupo } from "@/lib/fotos";
import { rangoFechas } from "@/lib/format";
import { cambiarCategoria, cambiarCategoriaVarias, marcarFavorita, ponerPortada } from "@/app/actions";
import { ponerLugar } from "@/app/acciones-extra";
import { CATEGORIAS, nombreCategoria, textoLugar, type Categoria } from "@/lib/categorias";
import type { Foto, FotoConViaje } from "@/lib/types";

type Item = Foto & { viajes?: FotoConViaje["viajes"] };
type Filtro = "todo" | "fotos" | "videos" | "favs" | `cat:${Categoria}`;
type Modo = "dia" | "viaje" | "nada" | "lugar" | "categoria";

/** Evento para abrir una foto desde afuera (p. ej. un marcador del mapa) */
export const EVENTO_ABRIR_FOTO = "mv:abrir-foto";

export function Galeria({
  fotos: fotosOriginales,
  titulo,
  sugerencias = [],
  agrupar = "dia",
  fechaInicio,
  diario,
  soloLectura = false,
}: {
  fotos: Item[];
  titulo?: string;
  /** dia: Día 1, Día 2… (según la fecha de la foto) · viaje: por viaje (galería general) */
  agrupar?: "dia" | "viaje" | "nada";
  fechaInicio?: string;
  /** Texto del diario por fecha: se muestra arriba de las fotos de cada día */
  diario?: Record<string, string> | null;
  /** Link público: sin favoritas */
  soloLectura?: boolean;
  /** Nombres de lugares para sugerir al poner el lugar a mano (p. ej. paradas de la ruta) */
  sugerencias?: string[];
}) {
  const [filtro, setFiltro] = useState<Filtro>("todo");
  const [modo, setModo] = useState<Modo>(agrupar);
  // Categorías cambiadas en esta sesión (se guardan al toque)
  const [cats, setCats] = useState<Record<string, Categoria | null>>({});
  const [favs, setFavs] = useState<Record<string, boolean>>({});
  const [abierta, setAbierta] = useState<string | null>(null);
  const [touchX, setTouchX] = useState<number | null>(null);
  // Selección múltiple (null = apagada)
  const [seleccion, setSeleccion] = useState<Set<string> | null>(null);
  const alternarSel = (ids: string[], poner?: boolean) =>
    setSeleccion((s) => {
      const n = new Set(s ?? []);
      const todas = ids.every((id) => n.has(id));
      for (const id of ids) (poner ?? !todas) ? n.add(id) : n.delete(id);
      return n;
    });
  // Lugares puestos a mano en esta sesión
  const [lugares, setLugares] = useState<Record<string, Pick<Foto, "lugar" | "provincia" | "pais">>>({});
  const fotos = useMemo(
    () => fotosOriginales.map((f) => (lugares[f.id] ? { ...f, ...lugares[f.id] } : f)),
    [fotosOriginales, lugares]
  );

  const esFav = useCallback((f: Item) => favs[f.id] ?? f.favorita ?? false, [favs]);
  const catDe = useCallback((f: Item): Categoria | null => (f.id in cats ? cats[f.id] : (f.categoria ?? null)), [cats]);

  const cuentas = useMemo(() => {
    const videos = fotos.filter((f) => f.tipo === "video").length;
    const porCat = new Map<Categoria, number>();
    for (const f of fotos) {
      const c = catDe(f);
      if (c) porCat.set(c, (porCat.get(c) ?? 0) + 1);
    }
    return {
      todo: fotos.length,
      fotos: fotos.length - videos,
      videos,
      favs: fotos.filter(esFav).length,
      porCat,
      conLugar: fotos.some((f) => f.lugar),
    };
  }, [fotos, esFav, catDe]);

  const grupos: Grupo<Item>[] = useMemo(() => {
    const visibles = fotos.filter((f) =>
      filtro === "fotos"
        ? f.tipo !== "video"
        : filtro === "videos"
          ? f.tipo === "video"
          : filtro === "favs"
            ? esFav(f)
            : filtro.startsWith("cat:")
              ? catDe(f) === filtro.slice(4)
              : true
    );
    // Agrupar por lugar o categoría: los grupos con más fotos primero, "sin…" al final
    if (modo === "lugar" || modo === "categoria") {
      const mapa = new Map<string, Grupo<Item>>();
      for (const f of visibles) {
        const c = modo === "lugar" ? textoLugar(f) || "" : (catDe(f) ?? "");
        if (!mapa.has(c)) {
          mapa.set(c, {
            clave: c || "sin",
            titulo: c ? (modo === "lugar" ? (f.lugar || c) : nombreCategoria(c)) : modo === "lugar" ? "Sin ubicación" : "Sin categoría",
            subtitulo: modo === "lugar" && c && f.provincia && f.provincia !== f.lugar ? f.provincia : undefined,
            items: [],
          });
        }
        mapa.get(c)!.items.push(f);
      }
      return [...mapa.entries()]
        .sort(([a, ga], [b, gb]) => (a ? 0 : 1) - (b ? 0 : 1) || gb.items.length - ga.items.length)
        .map(([, g]) => g);
    }
    if (modo === "dia" && fechaInicio) return agruparPorDia(visibles, fechaInicio);
    if (modo === "viaje") {
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
  }, [fotos, filtro, modo, fechaInicio, esFav, catDe]);

  // Orden de navegación del visor = orden en pantalla
  const lista = useMemo(() => grupos.flatMap((g) => g.items), [grupos]);

  // Con cientos de fotos: unas pocas por día (o por grupo) y "Ver más" en cada uno.
  // El visor igual recorre todas.
  const POR_GRUPO = grupos.length > 1 ? 8 : 24;
  const MAS = 40;
  const [mostrar, setMostrar] = useState<Record<string, number>>({});
  useEffect(() => setMostrar({}), [filtro, modo]);
  const cuantas = (clave: string) => mostrar[clave] ?? POR_GRUPO;
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

  async function elegirCategoria(f: Item, c: Categoria | null) {
    const antes = catDe(f);
    const nueva = antes === c ? null : c; // tocar la misma la quita
    setCats((x) => ({ ...x, [f.id]: nueva }));
    const r = await cambiarCategoria(f.id, nueva).catch(() => ({ error: "Sin conexión" }));
    if (r?.error) {
      setCats((x) => ({ ...x, [f.id]: antes }));
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
      // escribiendo el lugar: las flechas mueven el cursor, no cambian de foto
      if (e.target instanceof HTMLInputElement && e.key !== "Escape") return;
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
    ...CATEGORIAS.filter((c) => cuentas.porCat.has(c.valor)).map((c) => ({
      k: `cat:${c.valor}` as Filtro,
      label: c.label,
      icono: Tag,
      n: cuentas.porCat.get(c.valor)!,
    })),
  ];
  // Mostrar filtros solo si sirven para algo
  const conFiltros = (cuentas.videos > 0 && cuentas.fotos > 0) || cuentas.favs > 0 || cuentas.porCat.size > 0;

  // Formas de agrupar disponibles
  const modos: { k: Modo; label: string }[] = [
    ...(agrupar === "viaje" ? [{ k: "viaje" as Modo, label: "Por viaje" }] : []),
    ...(agrupar === "dia" ? [{ k: "dia" as Modo, label: "Por día" }] : []),
    ...(agrupar === "nada" ? [{ k: "nada" as Modo, label: "Todas" }] : []),
    ...(cuentas.conLugar ? [{ k: "lugar" as Modo, label: "Por lugar" }] : []),
    ...(cuentas.porCat.size ? [{ k: "categoria" as Modo, label: "Por categoría" }] : []),
  ];

  return (
    <div className={`space-y-5 ${seleccion ? "pb-40 md:pb-28" : ""}`}>
      {(modos.length > 1 || !soloLectura) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {modos.length > 1 && (
            <>
              <span className="text-niebla">Agrupar:</span>
              <div className="inline-flex overflow-hidden rounded-full border border-linea">
                {modos.map((m) => (
                  <button
                    key={m.k}
                    type="button"
                    onClick={() => setModo(m.k)}
                    className={`px-3 py-1.5 font-semibold transition ${modo === m.k ? "bg-white/10 text-white" : "text-niebla hover:text-white"}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </>
          )}
          {!soloLectura && (
            <button
              type="button"
              onClick={() => setSeleccion((s) => (s ? null : new Set()))}
              className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-semibold transition ${
                seleccion ? "border-naranja bg-naranja text-black" : "border-linea text-niebla hover:text-white"
              }`}
            >
              <CheckSquare className="size-3.5" /> {seleccion ? "Terminar" : "Seleccionar"}
            </button>
          )}
        </div>
      )}

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
              {modo === "viaje" ? (
                <Link href={`/viajes/${g.clave}`} className="group flex items-center gap-1.5 font-semibold hover:text-naranja">
                  {g.titulo} <ArrowRight className="size-4 opacity-0 transition group-hover:opacity-100" />
                </Link>
              ) : (
                <h3 className="font-display text-xl font-bold uppercase">{g.titulo}</h3>
              )}
              {g.subtitulo && <span className="text-xs text-niebla">{g.subtitulo}</span>}
              {seleccion ? (
                <button
                  type="button"
                  onClick={() => alternarSel(g.items.map((f) => f.id))}
                  className="ml-auto text-xs font-semibold text-naranja"
                >
                  {g.items.every((f) => seleccion.has(f.id)) ? "Quitar todas" : `Elegir las ${g.items.length}`}
                </button>
              ) : (
                <span className="ml-auto text-xs text-niebla">{g.items.length}</span>
              )}
            </div>
          )}
          {modo === "dia" && diario?.[g.clave] && (
            <p className="border-l-2 border-naranja/60 pl-3 text-sm leading-relaxed whitespace-pre-line text-white/85">{diario[g.clave]}</p>
          )}
          <div className="columns-2 gap-2 sm:columns-3 lg:columns-4">
            {g.items.slice(0, cuantas(g.clave)).map((f) => (
              <button
                key={f.id}
                onClick={() => (seleccion ? alternarSel([f.id]) : setAbierta(f.id))}
                aria-pressed={seleccion ? seleccion.has(f.id) : undefined}
                className={`group relative mb-2 block w-full overflow-hidden rounded-xl bg-grafito focus:ring-2 focus:ring-naranja focus:outline-none ${
                  seleccion?.has(f.id) ? "ring-3 ring-naranja" : ""
                }`}
              >
                {seleccion && (
                  <span
                    className={`pointer-events-none absolute top-2 right-2 z-10 grid size-6 place-items-center rounded-full border-2 ${
                      seleccion.has(f.id) ? "border-naranja bg-naranja text-black" : "border-white/80 bg-black/40"
                    }`}
                  >
                    {seleccion.has(f.id) && <Check className="size-4" strokeWidth={3} />}
                  </span>
                )}
                {seleccion && !seleccion.has(f.id) && <span className="pointer-events-none absolute inset-0 z-[1] bg-black/25" />}
                {/* Seleccionando: qué tiene cada foto, para ver qué falta */}
                {seleccion && (catDe(f) || f.lugar) && (
                  <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 z-10 flex flex-wrap gap-1">
                    {catDe(f) && <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">{nombreCategoria(catDe(f))}</span>}
                    {f.lugar && <span className="truncate rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">📍 {f.lugar}</span>}
                  </span>
                )}
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
          {(g.items.length > cuantas(g.clave) || cuantas(g.clave) > POR_GRUPO) && (
            <div className="flex gap-2">
              {g.items.length > cuantas(g.clave) && (
                <button
                  type="button"
                  onClick={() => setMostrar((m) => ({ ...m, [g.clave]: cuantas(g.clave) + MAS }))}
                  className="btn-ghost flex-1 py-2 text-sm"
                >
                  Ver más fotos{/^Día/i.test(g.titulo) ? ` del ${g.titulo.toLowerCase()}` : ""} ({g.items.length - cuantas(g.clave)} más)
                </button>
              )}
              {cuantas(g.clave) > POR_GRUPO && (
                <button type="button" onClick={() => setMostrar((m) => ({ ...m, [g.clave]: POR_GRUPO }))} className="btn-ghost py-2 text-sm">
                  Ver menos
                </button>
              )}
            </div>
          )}
        </section>
      ))}

      {seleccion && (
        <BarraSeleccion
          ids={[...seleccion]}
          visibles={lista.map((f) => f.id)}
          fotos={fotos}
          sugerencias={sugerencias}
          onElegirTodas={() => alternarSel(lista.map((f) => f.id), true)}
          onLimpiar={() => setSeleccion(new Set())}
          onCategoria={(ids, c) => setCats((x) => ({ ...x, ...Object.fromEntries(ids.map((id) => [id, c])) }))}
          onLugar={(ids, l) => setLugares((x) => ({ ...x, ...Object.fromEntries(ids.map((id) => [id, l])) }))}
          onTerminar={() => setSeleccion(null)}
        />
      )}

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
              {!soloLectura && (
              <button
                onClick={() => alternarFav(actual)}
                className={`btn-ghost px-3 py-1.5 ${esFav(actual) ? "text-red-400" : ""}`}
                title={esFav(actual) ? "Quitar de favoritas" : "Marcar como favorita"}
              >
                <Heart className={`size-4 ${esFav(actual) ? "fill-current" : ""}`} />
              </button>
              )}
              {!soloLectura && agrupar !== "viaje" && (
                <button
                  onClick={async () => {
                    const r = await ponerPortada(actual.id).catch(() => ({ error: "Sin conexión" }));
                    if (r?.error) alert(r.error);
                    else window.location.reload();
                  }}
                  className="btn-ghost px-3 py-1.5"
                  title="Usar como portada del viaje"
                >
                  <Star className="size-4" />
                  <span className="hidden sm:inline">Portada</span>
                </button>
              )}
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
                  <MapPin className="size-3.5" />{" "}
                  {/* con el editor de lugar abajo, acá solo el link al mapa */}
                  {soloLectura ? textoLugar(actual) || "Ver dónde fue" : "Ver en el mapa"}
                </a>
              )}
              {soloLectura && actual.lat == null && actual.lugar && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" /> {textoLugar(actual)}
                </span>
              )}
              {!soloLectura && actual.subida_por && (
                <span className="flex items-center gap-1">
                  <Camera className="size-3.5" /> {actual.subida_por}
                </span>
              )}
              {soloLectura && catDe(actual) && (
                <span className="flex items-center gap-1">
                  <Tag className="size-3.5" /> {nombreCategoria(catDe(actual))}
                </span>
              )}
            </div>
            {!soloLectura && (
              <div
                className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pt-1 sm:justify-center"
                aria-label="Categoría"
                // deslizar la fila de categorías no cambia de foto
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
              >
                {CATEGORIAS.map((c) => (
                  <button
                    key={c.valor}
                    type="button"
                    onClick={() => elegirCategoria(actual, c.valor)}
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                      catDe(actual) === c.valor
                        ? "border-naranja bg-naranja text-black"
                        : "border-white/15 text-white/60 hover:text-white"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            {!soloLectura && (
              <EditorLugar
                key={actual.id}
                foto={actual}
                fotos={fotos}
                sugerencias={sugerencias}
                onGuardado={(ids, l) => setLugares((x) => ({ ...x, ...Object.fromEntries(ids.map((id) => [id, l])) }))}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Fotos del mismo viaje sacadas hasta 1 h antes o después, que todavía no tienen lugar */
function cercanasSinLugar(foto: Item, fotos: Item[]) {
  if (!foto.tomada_en) return [];
  const t = Date.parse(foto.tomada_en);
  return fotos.filter(
    (f) =>
      f.id !== foto.id &&
      f.viaje_id === foto.viaje_id &&
      !f.lugar &&
      f.tomada_en &&
      Math.abs(Date.parse(f.tomada_en) - t) <= 60 * 60 * 1000
  );
}

function EditorLugar({
  foto,
  fotos,
  sugerencias,
  onGuardado,
}: {
  foto: Item;
  fotos: Item[];
  sugerencias: string[];
  onGuardado: (ids: string[], l: Pick<Foto, "lugar" | "provincia" | "pais">) => void;
}) {
  const actual = textoLugar(foto);
  const [texto, setTexto] = useState(actual);
  const [conCercanas, setConCercanas] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [msj, setMsj] = useState("");
  const cercanas = useMemo(() => cercanasSinLugar(foto, fotos), [foto, fotos]);
  const opciones = useMemo(
    () => [...new Set([...fotos.map((f) => textoLugar(f)).filter(Boolean), ...sugerencias])].sort((a, b) => a.localeCompare(b, "es")),
    [fotos, sugerencias]
  );
  const cambiado = texto.trim() !== actual;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!cambiado || guardando) return;
    const ids = [foto.id, ...(conCercanas && texto.trim() ? cercanas.map((f) => f.id) : [])];
    setGuardando(true);
    setMsj("");
    const r = await ponerLugar(ids, texto).catch(() => ({ lugar: null, provincia: null, pais: null, error: "Sin conexión" }));
    setGuardando(false);
    if (r.error) return setMsj(r.error);
    onGuardado(ids, { lugar: r.lugar, provincia: r.provincia, pais: r.pais });
    setTexto(textoLugar(r));
    setMsj(ids.length > 1 ? `Guardado en ${ids.length} fotos` : "Guardado");
  }

  return (
    <form
      onSubmit={guardar}
      className="mx-auto flex max-w-md flex-wrap items-center justify-center gap-x-2 gap-y-1 pt-1.5"
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 focus-within:border-naranja">
        <MapPin className="size-3.5 shrink-0 text-niebla" />
        <input
          value={texto}
          onChange={(e) => (setTexto(e.target.value), setMsj(""))}
          list="mv-lugares"
          maxLength={120}
          placeholder={foto.lat != null ? "Detectando lugar…" : "¿Dónde la sacaste? Ej: Tafí del Valle"}
          aria-label="Lugar"
          className="w-full min-w-0 bg-transparent text-xs text-white outline-none placeholder:text-white/40"
        />
        <datalist id="mv-lugares">
          {opciones.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </label>
      {cambiado && (
        <button disabled={guardando} className="rounded-full bg-naranja px-3 py-1 text-xs font-semibold text-black disabled:opacity-50">
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      )}
      {cambiado && texto.trim() && cercanas.length > 0 && (
        <label className="flex w-full items-center justify-center gap-1.5 text-[11px] text-niebla">
          <input type="checkbox" checked={conCercanas} onChange={(e) => setConCercanas(e.target.checked)} className="accent-[var(--color-naranja)]" />
          También a {cercanas.length} {cercanas.length === 1 ? "foto sacada" : "fotos sacadas"} cerca de esa hora (±1 h)
        </label>
      )}
      {msj && <p className="w-full text-[11px] text-niebla">{msj}</p>}
    </form>
  );
}

/** Barra fija abajo: categoría o lugar para todas las fotos seleccionadas */
function BarraSeleccion({
  ids,
  visibles,
  fotos,
  sugerencias,
  onElegirTodas,
  onLimpiar,
  onCategoria,
  onLugar,
  onTerminar,
}: {
  ids: string[];
  visibles: string[];
  fotos: Item[];
  sugerencias: string[];
  onElegirTodas: () => void;
  onLimpiar: () => void;
  onCategoria: (ids: string[], c: Categoria | null) => void;
  onLugar: (ids: string[], l: Pick<Foto, "lugar" | "provincia" | "pais">) => void;
  onTerminar: () => void;
}) {
  const [panel, setPanel] = useState<"cat" | "lugar" | null>(null);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [msj, setMsj] = useState("");
  const n = ids.length;
  const opciones = useMemo(
    () => [...new Set([...fotos.map((f) => textoLugar(f)).filter(Boolean), ...sugerencias])].sort((a, b) => a.localeCompare(b, "es")),
    [fotos, sugerencias]
  );

  async function categoria(c: Categoria | null) {
    setGuardando(true);
    const r = await cambiarCategoriaVarias(ids, c).catch(() => ({ error: "Sin conexión" }));
    setGuardando(false);
    if (r?.error) return setMsj(r.error);
    onCategoria(ids, c);
    setPanel(null);
    setMsj(c ? `${nombreCategoria(c)} en ${n} ${n === 1 ? "foto" : "fotos"}` : `Categoría quitada de ${n}`);
  }

  async function lugar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    const r = await ponerLugar(ids, texto).catch(() => ({ lugar: null, provincia: null, pais: null, error: "Sin conexión" }));
    setGuardando(false);
    if (r.error) return setMsj(r.error);
    onLugar(ids, { lugar: r.lugar, provincia: r.provincia, pais: r.pais });
    setPanel(null);
    setTexto("");
    setMsj(r.lugar ? `📍 ${textoLugar(r)} en ${n} ${n === 1 ? "foto" : "fotos"}` : `Lugar quitado de ${n}`);
  }

  return (
    <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 px-3 md:bottom-4">
      <div className="mx-auto max-w-2xl space-y-2 rounded-2xl border border-linea bg-carbon/95 p-3 shadow-2xl backdrop-blur">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">
            {n} {n === 1 ? "seleccionada" : "seleccionadas"}
          </span>
          {n < visibles.length ? (
            <button type="button" onClick={onElegirTodas} className="text-xs text-naranja">
              Elegir las {visibles.length}
            </button>
          ) : (
            <button type="button" onClick={onLimpiar} className="text-xs text-niebla">
              Ninguna
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              disabled={!n || guardando}
              onClick={() => (setPanel(panel === "cat" ? null : "cat"), setMsj(""))}
              className={`btn-ghost px-3 py-1.5 text-xs disabled:opacity-40 ${panel === "cat" ? "border-naranja text-naranja" : ""}`}
            >
              <Tag className="size-3.5" /> Categoría
            </button>
            <button
              type="button"
              disabled={!n || guardando}
              onClick={() => (setPanel(panel === "lugar" ? null : "lugar"), setMsj(""))}
              className={`btn-ghost px-3 py-1.5 text-xs disabled:opacity-40 ${panel === "lugar" ? "border-naranja text-naranja" : ""}`}
            >
              <MapPin className="size-3.5" /> Lugar
            </button>
            <button type="button" onClick={onTerminar} className="btn-ghost px-2.5 py-1.5" title="Terminar">
              <X className="size-4" />
            </button>
          </div>
        </div>

        {panel === "cat" && (
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIAS.map((c) => (
              <button
                key={c.valor}
                type="button"
                disabled={guardando}
                onClick={() => categoria(c.valor)}
                className="rounded-full border border-linea px-3 py-1.5 text-xs font-medium hover:border-naranja hover:text-naranja disabled:opacity-50"
              >
                {c.label}
              </button>
            ))}
            <button type="button" disabled={guardando} onClick={() => categoria(null)} className="px-2 text-xs text-niebla underline">
              Quitar
            </button>
          </div>
        )}

        {panel === "lugar" && (
          <form onSubmit={lugar} className="flex gap-2">
            <input
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              list="mv-lugares-sel"
              maxLength={120}
              placeholder="Ej: Tafí del Valle (vacío = quitar)"
              aria-label="Lugar para las seleccionadas"
              className="input min-w-0 flex-1 py-2 text-sm"
            />
            <datalist id="mv-lugares-sel">
              {opciones.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
            <button disabled={guardando} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
              {guardando ? "…" : "Poner"}
            </button>
          </form>
        )}

        {msj && (
          <p className="text-xs text-niebla" role="status">
            {msj}
          </p>
        )}
      </div>
    </div>
  );
}
