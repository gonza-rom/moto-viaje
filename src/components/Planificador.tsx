"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Fuel, LoaderCircle, MapPinned, Route, Search, TriangleAlert, Wallet } from "lucide-react";
import { EditorRutaLazy, MapaRutaLazy } from "./mapas";
import { guardarBorrador, leerBorrador } from "@/lib/offline";
import { kmAcumulados, reducir, ubicarEnRecorrido } from "@/lib/recorrido";
import { plata } from "@/lib/gastos";
import { km as fmtKm, num } from "@/lib/format";
import type { Ruta } from "@/lib/ruta";
import type { Punto } from "@/lib/gpx";

export type MotoPlan = { id: string; nombre: string; tanque: number | null; consumo: number | null };

type Estacion = { nombre: string; lat: number; lng: number; km: number };

const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
/** Distancia máxima a la ruta para considerar una estación (km) */
const DESVIO_MAX = 3;

const aNum = (s: string) => {
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const aNumDecimal = (s: string) => {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Cajas que cubren la ruta: una por cada ~80 km, con margen. Consultar varias cajas chicas es
 * mucho más liviano para Overpass que "around" sobre toda la línea (que suele dar timeout).
 */
function cajasDeRuta(trazo: Punto[], cadaKm = 80, margen = 0.035): string[] {
  const puntos = reducir(trazo, 3000);
  const acum = kmAcumulados(puntos);
  const cajas: string[] = [];
  let desde = 0;
  for (let i = 1; i <= puntos.length; i++) {
    if (i === puntos.length || acum[i] - acum[desde] >= cadaKm) {
      const tramo = puntos.slice(desde, Math.min(i + 1, puntos.length));
      const lats = tramo.map((x) => x[0]);
      const lngs = tramo.map((x) => x[1]);
      cajas.push(
        [Math.min(...lats) - margen, Math.min(...lngs) - margen, Math.max(...lats) + margen, Math.max(...lngs) + margen]
          .map((n) => n.toFixed(4))
          .join(",")
      );
      desde = i;
    }
  }
  return cajas;
}

/** Estaciones de servicio a lo largo de la ruta (OpenStreetMap / Overpass) */
async function buscarEstaciones(trazo: Punto[], signal: AbortSignal): Promise<Estacion[]> {
  const cajas = cajasDeRuta(trazo);
  const q = `[out:json][timeout:50];(${cajas.map((c) => `nwr["amenity"="fuel"](${c});`).join("")});out center tags;`;
  let ultimoError: unknown;
  for (const url of OVERPASS) {
    try {
      const r = await fetch(url, { method: "POST", body: new URLSearchParams({ data: q }), signal });
      if (!r.ok) throw new Error(r.status === 429 ? "El servidor de mapas está saturado. Probá en un minuto." : `Overpass respondió ${r.status}`);
      const j = (await r.json()) as {
        remark?: string;
        elements: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[];
      };
      // Si la consulta se cortó (timeout / memoria), Overpass responde 200 con un "remark": no es "sin estaciones"
      if (j.remark && /error|timed out|out of memory/i.test(j.remark)) throw new Error("El servidor de mapas tardó demasiado.");
      const puntos = reducir(trazo, 3000);
      const acum = kmAcumulados(puntos);
      const lista = j.elements
        .map((e) => {
          const lat = e.lat ?? e.center?.lat;
          const lng = e.lon ?? e.center?.lon;
          if (lat == null || lng == null) return null;
          const u = ubicarEnRecorrido([lat, lng], puntos, acum);
          if (u.desvio > DESVIO_MAX) return null;
          const t = e.tags ?? {};
          const nombre = [t.brand || t.name || "Estación", t["addr:city"]].filter(Boolean).join(" · ");
          return { nombre, lat, lng, km: u.km };
        })
        .filter((x): x is Estacion => !!x)
        .sort((a, b) => a.km - b.km);
      // Varias en el mismo lugar (mismo pueblo): quedarse con una cada ~1 km
      return lista.filter((e, i) => i === 0 || e.km - lista[i - 1].km > 1);
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      ultimoError = e;
    }
  }
  throw ultimoError instanceof Error ? ultimoError : new Error("No se pudieron buscar las estaciones");
}

export function Planificador({ motos, precio: precioInicial }: { motos: MotoPlan[]; precio: number | null }) {
  const router = useRouter();
  const [ruta, setRuta] = useState<Ruta | null>(null);
  const [motoId, setMotoId] = useState(motos[0]?.id ?? "");
  const moto = motos.find((m) => m.id === motoId);
  const [consumoTxt, setConsumoTxt] = useState(moto?.consumo ? String(Math.round(moto.consumo * 10) / 10).replace(".", ",") : "");
  const [tanqueTxt, setTanqueTxt] = useState(moto?.tanque ? String(moto.tanque).replace(".", ",") : "");
  const [precioTxt, setPrecioTxt] = useState(precioInicial ? String(precioInicial) : "");
  const [reserva, setReserva] = useState(15);
  const [estaciones, setEstaciones] = useState<Estacion[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState("");

  function elegirMoto(id: string) {
    setMotoId(id);
    const m = motos.find((x) => x.id === id);
    if (m?.consumo) setConsumoTxt(String(Math.round(m.consumo * 10) / 10).replace(".", ","));
    if (m?.tanque) setTanqueTxt(String(m.tanque).replace(".", ","));
  }

  const consumo = aNumDecimal(consumoTxt); // km/l
  const tanque = aNumDecimal(tanqueTxt); // litros
  const precio = aNum(precioTxt); // $/l
  const km = ruta?.km ?? 0;
  const litros = consumo && km ? km / consumo : null;
  const costo = litros && precio ? litros * precio : null;
  const autonomia = consumo && tanque ? consumo * tanque * (1 - reserva / 100) : null;

  // Tramos entre estaciones (incluye salida y llegada)
  const tramos = useMemo(() => {
    if (!estaciones || !km) return null;
    // Estaciones a menos de 8 km entre sí (mismo pueblo) cuentan como una parada para cargar
    const paradas: { nombre: string; km: number; n: number }[] = [];
    for (const e of estaciones) {
      const ult = paradas[paradas.length - 1];
      if (ult && e.km - ult.km < 8) ult.n++;
      else paradas.push({ nombre: e.nombre, km: e.km, n: 1 });
    }
    const hitos = [
      { nombre: "Salida", km: 0 },
      ...paradas.map((x) => ({ nombre: x.n > 1 ? `${x.nombre} (+${x.n - 1})` : x.nombre, km: x.km })),
      { nombre: "Llegada", km },
    ].filter((h, i, arr) => i === 0 || i === arr.length - 1 || (h.km > 2 && km - h.km > 2));
    return hitos.slice(1).map((h, i) => ({ desde: hitos[i], hasta: h, largo: h.km - hitos[i].km }));
  }, [estaciones, km]);
  const peligrosos = autonomia && tramos ? tramos.filter((t) => t.largo > autonomia) : [];
  const masLargo = tramos?.reduce((m, t) => (t.largo > m.largo ? t : m), tramos[0]);

  async function estacionesEnRuta() {
    if (!ruta?.trazo || ruta.trazo.length < 2) return;
    setBuscando(true);
    setError("");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 90000);
    try {
      setEstaciones(await buscarEstaciones(ruta.trazo, ctrl.signal));
    } catch (e) {
      setError((e as Error).name === "AbortError" ? "Tardó demasiado. Probá de nuevo en un rato." : (e as Error).message);
    } finally {
      clearTimeout(t);
      setBuscando(false);
    }
  }

  function crearViaje() {
    if (!ruta) return;
    const previo = leerBorrador("mv:borrador:nuevo");
    if (previo && !previo.desdePlan && !confirm("Tenés un viaje nuevo sin guardar. ¿Reemplazarlo por esta ruta?")) return;
    const p = ruta.paradas;
    guardarBorrador("mv:borrador:nuevo", {
      desdePlan: true,
      titulo: "",
      moto_id: motoId,
      notas: "",
      fechaIni: new Date().toISOString().slice(0, 10),
      fechaFin: "",
      origen: p[0]?.nombre ?? "",
      destino: p.length > 1 ? (p[p.length - 1].nombre ?? "") : "",
      kmTxt: String(Math.round(ruta.km)),
      odoIni: "",
      odoFin: "",
      fotos: [],
      ruta,
      gpx: null,
      diario: {},
      etiquetas: [],
    });
    router.push("/viajes/nuevo");
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-3 p-4">
        <h2 className="label flex items-center gap-1.5">
          <Route className="size-3.5" /> 1 · La ruta
        </h2>
        <EditorRutaLazy
          inicial={null}
          origen=""
          destino=""
          onChange={(r) => {
            setRuta(r);
            setEstaciones(null);
          }}
        />
      </section>

      <section className="card space-y-4 p-4">
        <h2 className="label flex items-center gap-1.5">
          <Fuel className="size-3.5" /> 2 · La moto
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {motos.length > 1 && (
            <div className="col-span-2 sm:col-span-1">
              <label className="label">Moto</label>
              <select value={motoId} onChange={(e) => elegirMoto(e.target.value)} className="input">
                {motos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="label">Consumo (km/l)</label>
            <input value={consumoTxt} onChange={(e) => setConsumoTxt(e.target.value)} inputMode="decimal" placeholder="30" className="input" />
          </div>
          <div>
            <label className="label">Tanque (litros)</label>
            <input value={tanqueTxt} onChange={(e) => setTanqueTxt(e.target.value)} inputMode="decimal" placeholder="12" className="input" />
          </div>
          <div>
            <label className="label">Nafta $/litro</label>
            <input value={precioTxt} onChange={(e) => setPrecioTxt(e.target.value)} inputMode="numeric" placeholder="1500" className="input" />
          </div>
          <div>
            <label className="label">Reserva</label>
            <select value={reserva} onChange={(e) => setReserva(Number(e.target.value))} className="input">
              {[0, 10, 15, 20, 25].map((r) => (
                <option key={r} value={r}>
                  {r ? `${r} %` : "Sin reserva"}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-niebla">
          {moto?.consumo
            ? `El consumo sale de tus cargas de nafta con tanque lleno (${moto.nombre}).`
            : "Cargá nafta con el odómetro y \"tanque lleno\" en Motos y el consumo se completa solo."}{" "}
          {!moto?.tanque && "Guardá los litros del tanque en Motos para no tener que escribirlos."}{" "}
          {precioInicial ? "El precio es el de tu última carga." : ""}
        </p>
      </section>

      {km > 0 && (
        <section className="card space-y-4 p-4">
          <h2 className="label flex items-center gap-1.5">
            <Wallet className="size-3.5" /> 3 · Resultado
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Dato label="Distancia" valor={fmtKm(Math.round(km))} />
            <Dato label="Nafta necesaria" valor={litros ? `${num(Math.ceil(litros))} l` : "—"} />
            <Dato label="Costo de nafta" valor={costo ? plata(Math.round(costo / 100) * 100) : "—"} destacado />
            <Dato label="Autonomía" valor={autonomia ? fmtKm(Math.floor(autonomia)) : "—"} />
          </div>
          {(!consumo || !tanque) && <p className="text-xs text-niebla">Completá consumo y tanque para ver la autonomía y los tramos.</p>}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={estacionesEnRuta} disabled={buscando} className="btn-ghost disabled:opacity-50">
              {buscando ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
              {buscando ? "Buscando estaciones…" : estaciones ? "Volver a buscar estaciones" : "Buscar estaciones en la ruta"}
            </button>
            <button type="button" onClick={crearViaje} className="btn-primary">
              <MapPinned className="size-4" /> Crear viaje con esta ruta
            </button>
          </div>
          {error && (
            <p className="flex items-center gap-1.5 text-sm text-red-400">
              <CircleAlert className="size-4" /> {error}
            </p>
          )}

          {estaciones && tramos && (
            <div className="space-y-3">
              {autonomia && (
                <p
                  className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
                    peligrosos.length ? "border-red-500/40 bg-red-500/10 text-red-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  }`}
                >
                  {peligrosos.length ? <TriangleAlert className="mt-0.5 size-4 shrink-0" /> : <Fuel className="mt-0.5 size-4 shrink-0" />}
                  {peligrosos.length
                    ? `${peligrosos.length === 1 ? "Hay 1 tramo" : `Hay ${peligrosos.length} tramos`} más largo que tu autonomía (${fmtKm(Math.floor(autonomia))}). Llevá un bidón o cargá antes.`
                    : `Llegás bien: el tramo más largo sin estaciones es de ${fmtKm(Math.round(masLargo?.largo ?? 0))}.`}
                </p>
              )}

              <div className="h-72 overflow-hidden rounded-2xl border border-linea md:h-96">
                <MapaRutaLazy ruta={ruta} marcadores={estaciones.map((e) => ({ lat: e.lat, lng: e.lng, nombre: `${e.nombre} · km ${Math.round(e.km)}` }))} />
              </div>

              <p className="text-xs text-niebla">
                {estaciones.length} {estaciones.length === 1 ? "estación" : "estaciones"} a menos de {DESVIO_MAX} km de la ruta, según
                OpenStreetMap. Puede faltar alguna o haber alguna cerrada: confirmalo antes de salir.
              </p>
              <ol className="space-y-1.5">
                {tramos.map((t, i) => {
                  const malo = autonomia ? t.largo > autonomia : false;
                  const justo = autonomia ? !malo && t.largo > autonomia * 0.8 : false;
                  return (
                    <li key={i} className="flex items-center gap-3 text-sm">
                      <span className="w-14 shrink-0 text-right text-xs text-niebla">km {Math.round(t.desde.km)}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {t.desde.nombre} <span className="text-niebla">→</span> {t.hasta.nombre}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          malo ? "bg-red-500/20 text-red-300" : justo ? "bg-amber-500/20 text-amber-200" : "bg-white/5 text-niebla"
                        }`}
                      >
                        {fmtKm(Math.round(t.largo))}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Dato({ label, valor, destacado }: { label: string; valor: string; destacado?: boolean }) {
  return (
    <div className="rounded-xl bg-grafito/60 p-3">
      <p className="text-xs text-niebla">{label}</p>
      <p className={`font-display text-2xl font-bold ${destacado ? "text-naranja" : ""}`}>{valor}</p>
    </div>
  );
}
