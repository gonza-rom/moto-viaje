"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, LoaderCircle, MapPin, MapPinned, Pencil, Plus, RefreshCw, Search, Star, X } from "lucide-react";
import { parseGpx, type Punto } from "@/lib/gpx";
import { nombrarLugar, type Ruta } from "@/lib/ruta";
import { kmAcumulados, muestrear, puntoEnKm, reducir, ubicarEnRecorrido } from "@/lib/recorrido";
import { guardarLugaresRecorrido, ponerLugar } from "@/app/acciones-extra";
import { cldMiniatura } from "@/lib/cld";
import { fechaHoraFoto } from "@/lib/fotos";
import type { Foto, LugarRecorrido } from "@/lib/types";

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
  fotos = [],
}: {
  /** Fotos del viaje: tocando una localidad se eligen las que se sacaron ahí */
  fotos?: Foto[];
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
  const [asignando, setAsignando] = useState<LugarRecorrido | null>(null);
  const porLugar = (n: string) => fotos.filter((f) => f.lugar?.toLowerCase() === n.toLowerCase()).length;
  const hayRecorrido = !!gpxUrl || (ruta?.trazo?.length ?? 0) > 1;
  const [editando, setEditando] = useState(false);

  // Puntos del recorrido (se cargan una vez)
  const puntosRef = useRef<Punto[] | null>(null);
  async function cargarPuntos(): Promise<Punto[]> {
    if (puntosRef.current) return puntosRef.current;
    let puntos: Punto[] = [];
    if (gpxUrl) puntos = parseGpx(await (await fetch(gpxUrl)).text());
    if (puntos.length < 2 && ruta?.trazo) puntos = ruta.trazo;
    if (puntos.length < 2) throw new Error("El recorrido no tiene puntos");
    puntosRef.current = puntos;
    return puntos;
  }

  /** Guarda la lista (ordenada por km) */
  async function guardarLista(nueva: LugarRecorrido[]) {
    const ordenada = [...nueva].sort((a, b) => a.km - b.km);
    const r = await guardarLugaresRecorrido(viajeId, ordenada).catch(() => ({ error: "Sin conexión" }));
    if (r?.error) throw new Error(r.error);
    setLugares(ordenada);
  }

  async function quitar(l: LugarRecorrido) {
    if (!lugares || !confirm(`¿Quitar "${l.nombre}" de la lista?`)) return;
    try {
      await guardarLista(lugares.filter((x) => x !== l));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function buscar() {
    if (corriendo.current) return;
    corriendo.current = true;
    setError("");
    const propios = (lugares ?? []).filter((l) => l.propio);
    try {
      const puntos = await cargarPuntos();

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
      if (!encontrados.length && !propios.length) throw new Error("No se encontraron localidades en el recorrido");
      // Los lugares agregados a mano se conservan
      const nombres = new Set(propios.map((l) => l.nombre.toLowerCase()));
      await guardarLista([...encontrados.filter((l) => !nombres.has(l.nombre.toLowerCase())), ...propios]);
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
          <div className="ml-auto flex gap-2">
            {editando && (
              <button
                type="button"
                onClick={() => confirm("¿Volver a buscar las localidades? Los lugares que agregaste se mantienen.") && buscar()}
                className="btn-ghost px-3 py-1 text-xs"
                title="Volver a buscar"
              >
                <RefreshCw className="size-3.5" /> Volver a buscar
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditando((e) => !e)}
              className={`btn-ghost px-3 py-1 text-xs ${editando ? "border-naranja text-naranja" : ""}`}
            >
              {editando ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />} {editando ? "Listo" : "Editar"}
            </button>
          </div>
        )}
      </div>

      {editando && lugares && (
        <AgregarLugar
          lugares={lugares}
          cargarPuntos={cargarPuntos}
          onAgregar={async (l) => {
            await guardarLista([...lugares, l]);
          }}
        />
      )}

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
                    {editando ? (
                      <button
                        type="button"
                        onClick={() => quitar(l)}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 hover:border-red-400 hover:text-red-300 ${
                          l.propio ? "border-naranja/70" : "border-linea"
                        }`}
                        title="Quitar de la lista"
                      >
                        {l.propio && <Star className="size-3 fill-naranja text-naranja" />}
                        {l.nombre} <X className="size-3 text-niebla" />
                      </button>
                    ) : editable && fotos.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setAsignando(l)}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 transition hover:border-naranja ${
                          porLugar(l.nombre) ? "border-naranja/60 text-white" : "border-linea"
                        }`}
                        title={`km ${Math.round(l.km)} · tocá para elegir las fotos que sacaste acá`}
                      >
                        {l.propio && <Star className="size-3 fill-naranja text-naranja" />}
                        {l.nombre}
                        {porLugar(l.nombre) > 0 && (
                          <span className="flex items-center gap-0.5 text-[11px] text-naranja">
                            <Camera className="size-3" />
                            {porLugar(l.nombre)}
                          </span>
                        )}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-linea px-2.5 py-0.5" title={`km ${Math.round(l.km)}`}>
                        {l.propio && <Star className="size-3 fill-naranja text-naranja" />}
                        {l.nombre}
                      </span>
                    )}
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ol>
      )}
      {editable && fotos.length > 0 && tramos.length > 0 && (
        <p className="text-xs text-niebla">Tocá una localidad para elegir las fotos que sacaste ahí.</p>
      )}

      {asignando && (
        <AsignarFotos
          lugar={asignando}
          fotos={fotos}
          onCerrar={() => setAsignando(null)}
          // las fotos se muestran en varias partes de la página: recargar para que todo quede igual
          onGuardado={() => window.location.reload()}
        />
      )}
    </section>
  );
}

/** Elegir las fotos sacadas en una localidad del recorrido */
function AsignarFotos({
  lugar,
  fotos,
  onCerrar,
  onGuardado,
}: {
  lugar: LugarRecorrido;
  fotos: Foto[];
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const esDeAca = (f: Foto) => f.lugar?.toLowerCase() === lugar.nombre.toLowerCase();
  const [sel, setSel] = useState(() => new Set(fotos.filter(esDeAca).map((f) => f.id)));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const alternar = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // Por día, para encontrarlas más fácil
  const dias = new Map<string, Foto[]>();
  for (const f of fotos) {
    const d = f.tomada_en?.slice(0, 10) ?? "sin-fecha";
    dias.set(d, [...(dias.get(d) ?? []), f]);
  }

  async function guardar() {
    setGuardando(true);
    setError("");
    const poner = [...sel];
    const quitar = fotos.filter((f) => esDeAca(f) && !sel.has(f.id)).map((f) => f.id);
    const texto = [lugar.nombre, lugar.provincia, lugar.pais].filter(Boolean).join(", ");
    const intentar = async (ids: string[], t: string): Promise<string | undefined> => {
      if (!ids.length) return undefined;
      const r = await ponerLugar(ids, t).catch(() => ({ error: "Sin conexión" }));
      return r.error;
    };
    const err = (await intentar(poner, texto)) ?? (await intentar(quitar, ""));
    setGuardando(false);
    if (err) return setError(err);
    onGuardado();
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/80 sm:items-center" onClick={onCerrar}>
      <div className="card flex max-h-[90dvh] w-full max-w-2xl flex-col gap-3 rounded-b-none p-4 sm:rounded-b-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-2">
          <div>
            <h2 className="font-display text-2xl font-bold uppercase">¿Qué fotos sacaste en {lugar.nombre}?</h2>
            <p className="text-xs text-niebla">
              {lugar.provincia ? `${lugar.provincia} · ` : ""}km {Math.round(lugar.km)} · {sel.size} elegidas
            </p>
          </div>
          <button type="button" onClick={onCerrar} className="btn-ghost ml-auto px-2.5 py-1.5" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 space-y-3 overflow-y-auto">
          {[...dias.entries()].map(([d, lista]) => (
            <div key={d} className="space-y-1.5">
              <p className="flex items-center gap-2 text-xs font-semibold text-niebla">
                {d === "sin-fecha" ? "Sin fecha" : fechaHoraFoto(`${d}T`, false)}
                <button
                  type="button"
                  onClick={() =>
                    setSel((s) => {
                      const n = new Set(s);
                      const todas = lista.every((f) => n.has(f.id));
                      for (const f of lista) (todas ? n.delete(f.id) : n.add(f.id));
                      return n;
                    })
                  }
                  className="font-normal text-naranja"
                >
                  {lista.every((f) => sel.has(f.id)) ? "quitar todas" : "elegir todas"}
                </button>
              </p>
              <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {lista.map((f) => {
                  const si = sel.has(f.id);
                  const otro = f.lugar && !esDeAca(f) ? f.lugar : null;
                  return (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => alternar(f.id)}
                        aria-pressed={si}
                        className={`relative block aspect-square w-full overflow-hidden rounded-lg ${si ? "ring-3 ring-naranja" : ""}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={cldMiniatura(f, { w: 300, h: 300, crop: "fill" })} alt="" className={`size-full object-cover ${si ? "" : "opacity-70"}`} loading="lazy" />
                        <span
                          className={`absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full border-2 ${
                            si ? "border-naranja bg-naranja text-black" : "border-white/80 bg-black/40"
                          }`}
                        >
                          {si && <Check className="size-4" strokeWidth={3} />}
                        </span>
                        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-1.5 pt-4 pb-1 text-left text-[10px] text-white">
                          {f.tomada_en ? f.tomada_en.slice(11, 16) : ""}
                          {otro && !si ? ` · 📍 ${otro}` : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="button" onClick={guardar} disabled={guardando} className="btn-primary disabled:opacity-50">
          {guardando ? <LoaderCircle className="size-4 animate-spin" /> : <MapPin className="size-4" />}
          {guardando ? "Guardando…" : `Guardar: ${sel.size} ${sel.size === 1 ? "foto" : "fotos"} en ${lugar.nombre}`}
        </button>
      </div>
    </div>
  );
}

/**
 * Agregar un lugar a mano (p. ej. "Cuesta del Clavillo"). Primero se busca en el mapa SOLO alrededor
 * del recorrido; si no aparece (muchos parajes no están en OpenStreetMap), se elige entre qué
 * localidades va y se ubica sobre la ruta.
 */
function AgregarLugar({
  lugares,
  cargarPuntos,
  onAgregar,
}: {
  lugares: LugarRecorrido[];
  cargarPuntos: () => Promise<Punto[]>;
  onAgregar: (l: LugarRecorrido) => Promise<void>;
}) {
  const [nombre, setNombre] = useState("");
  const [estado, setEstado] = useState<"" | "buscando" | "elegir" | "guardando">("");
  const [entre, setEntre] = useState(0);
  const [msj, setMsj] = useState("");

  const limpio = nombre.replace(/\s+/g, " ").trim().slice(0, 80);

  async function agregar(l: LugarRecorrido) {
    setEstado("guardando");
    try {
      await onAgregar(l);
      setMsj(`⭐ ${l.nombre} agregado (km ${Math.round(l.km)})`);
      setNombre("");
      setEstado("");
    } catch (e) {
      setMsj((e as Error).message);
      setEstado("");
    }
  }

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (!limpio) return;
    setMsj("");
    setEstado("buscando");
    try {
      const puntos = reducir(await cargarPuntos(), 3000);
      const acum = kmAcumulados(puntos);
      const lats = puntos.map((p) => p[0]);
      const lngs = puntos.map((p) => p[1]);
      const m = 0.15; // margen ~15 km
      const caja = [Math.min(...lngs) - m, Math.max(...lats) + m, Math.max(...lngs) + m, Math.min(...lats) - m].join(",");
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&accept-language=es&bounded=1&viewbox=${caja}&q=${encodeURIComponent(limpio)}`
      );
      const res = r.ok ? ((await r.json()) as { lat: string; lon: string; address?: Record<string, string> }[]) : [];
      for (const x of res) {
        const u = ubicarEnRecorrido([+x.lat, +x.lon], puntos, acum);
        if (u.desvio > 15) continue;
        const a = x.address ?? {};
        await agregar({
          nombre: limpio,
          provincia: a.state || a.province || undefined,
          pais: a.country || undefined,
          km: Math.round(u.km * 10) / 10,
          lat: +x.lat,
          lng: +x.lon,
          propio: true,
        });
        return;
      }
      // No está en el mapa: elegir entre qué localidades va
      setEntre(0);
      setEstado("elegir");
    } catch {
      setEstado("elegir");
    }
  }

  async function ubicarEntre() {
    const puntos = reducir(await cargarPuntos(), 3000);
    const acum = kmAcumulados(puntos);
    const a = lugares[entre];
    const b = lugares[entre + 1] ?? a;
    const km = (a.km + b.km) / 2;
    const [lat, lng] = puntoEnKm(puntos, acum, km);
    await agregar({ nombre: limpio, provincia: a.provincia, pais: a.pais, km: Math.round(km * 10) / 10, lat, lng, propio: true });
  }

  return (
    <div className="card space-y-2 p-3">
      <form onSubmit={buscar} className="flex gap-2">
        <input
          value={nombre}
          onChange={(e) => (setNombre(e.target.value), setEstado(""), setMsj(""))}
          maxLength={80}
          placeholder="Agregar un lugar: Cuesta del Clavillo, un dique, un mirador…"
          aria-label="Agregar un lugar al recorrido"
          className="input min-w-0 flex-1 py-2 text-sm"
        />
        <button disabled={!limpio || estado === "buscando" || estado === "guardando"} className="btn-primary px-3 py-2 text-sm disabled:opacity-50">
          {estado === "buscando" ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} Agregar
        </button>
      </form>

      {estado === "elegir" && lugares.length > 0 && (
        <div className="space-y-2 rounded-xl border border-linea p-2.5">
          <p className="flex items-center gap-1.5 text-xs text-niebla">
            <Search className="size-3.5" /> «{limpio}» no está en el mapa. ¿Entre qué localidades queda?
          </p>
          <select value={entre} onChange={(e) => setEntre(Number(e.target.value))} className="input py-2 text-sm">
            {lugares.slice(0, -1).map((l, i) => (
              <option key={i} value={i}>
                Entre {l.nombre} y {lugares[i + 1].nombre} (km {Math.round(l.km)}–{Math.round(lugares[i + 1].km)})
              </option>
            ))}
          </select>
          <button type="button" onClick={ubicarEntre} className="btn-primary w-full py-2 text-sm">
            <Star className="size-4" /> Agregar «{limpio}» ahí
          </button>
        </div>
      )}
      {msj && <p className="text-xs text-niebla">{msj}</p>}
      <p className="text-[11px] text-niebla/70">Tocá una localidad para quitarla. Las que agregás quedan con ⭐ y no se pierden al volver a buscar.</p>
    </div>
  );
}
