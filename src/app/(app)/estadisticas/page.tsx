import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  ChartColumn,
  DatabaseBackup,
  Fuel,
  Gauge,
  Globe,
  MapPinned,
  MountainSnow,
  Route,
  Tag,
  Trophy,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { getGastos, getMantenimientos, getViajes } from "@/lib/queries";
import { dias, km, num, rangoFechas } from "@/lib/format";
import { labelGasto, plata, resumirGastos } from "@/lib/gastos";
import { MapaProvincias } from "@/components/MapaProvincias";
import { BotonTarjeta } from "@/components/BotonTarjeta";
import { EspacioFotos } from "@/components/EspacioFotos";
import type { ViajeConRelaciones } from "@/lib/types";

export const metadata = { title: "Estadísticas" };

const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

export default async function Estadisticas() {
  const [viajes, gastos, mants] = await Promise.all([
    getViajes(),
    getGastos().catch(() => []),
    getMantenimientos().catch(() => []),
  ]);

  if (!viajes.length) {
    return (
      <div className="card mx-auto max-w-lg space-y-3 p-10 text-center">
        <ChartColumn className="mx-auto size-10 text-niebla" strokeWidth={1.5} />
        <h1 className="font-display text-3xl font-bold uppercase">Sin datos todavía</h1>
        <p className="text-niebla">Cargá tu primer viaje y acá aparecen tus récords y números.</p>
      </div>
    );
  }

  // Por año
  const porAnio = new Map<string, { km: number; viajes: number; dias: number }>();
  for (const v of viajes) {
    const a = v.fecha_inicio.slice(0, 4);
    const x = porAnio.get(a) ?? { km: 0, viajes: 0, dias: 0 };
    x.km += v.km;
    x.viajes++;
    x.dias += dias(v.fecha_inicio, v.fecha_fin);
    porAnio.set(a, x);
  }
  const anios = [...porAnio.entries()].sort(([a], [b]) => a.localeCompare(b));
  const maxAnio = Math.max(1, ...anios.map(([, x]) => x.km));

  // Récords
  const mayor = <T,>(arr: T[], f: (x: T) => number | null) =>
    arr.reduce<{ x: T; v: number } | null>((m, x) => {
      const v = f(x);
      return v !== null && v > 0 && (!m || v > m.v) ? { x, v } : m;
    }, null);
  const records: { icono: LucideIcon; label: string; r: { x: ViajeConRelaciones; v: number } | null; fmt: (n: number) => string }[] = [
    { icono: Route, label: "Viaje más largo", r: mayor(viajes, (v) => v.km), fmt: km },
    { icono: Gauge, label: "Más km por día", r: mayor(viajes, (v) => v.km / dias(v.fecha_inicio, v.fecha_fin)), fmt: (n) => `${km(Math.round(n))}/día` },
    { icono: CalendarDays, label: "Más días en ruta", r: mayor(viajes, (v) => dias(v.fecha_inicio, v.fecha_fin)), fmt: (n) => `${n} días` },
    { icono: MountainSnow, label: "Más alto", r: mayor(viajes, (v) => v.altimetria?.max ?? null), fmt: (n) => `${num(n)} m` },
    { icono: ArrowUpRight, label: "Más subida acumulada", r: mayor(viajes, (v) => v.altimetria?.subida ?? null), fmt: (n) => `${num(n)} m` },
  ];

  // Lugares (de las paradas de las rutas marcadas y de dónde se sacaron las fotos)
  const lugares = new Map<string, Map<string, Set<string>>>(); // país → provincia → viajes
  for (const v of viajes) {
    const conProvincia = [...(v.ruta?.paradas ?? []), ...v.fotos.map((f) => ({ provincia: f.provincia, pais: f.pais })), ...(v.lugares ?? [])];
    for (const p of conProvincia) {
      if (!p.provincia) continue;
      const pais = p.pais ?? "—";
      if (!lugares.has(pais)) lugares.set(pais, new Map());
      const provs = lugares.get(pais)!;
      if (!provs.has(p.provincia)) provs.set(p.provincia, new Set());
      provs.get(p.provincia)!.add(v.id);
    }
  }
  const nProvincias = [...lugares.values()].reduce((a, m) => a + m.size, 0);

  // Gastos
  const r = resumirGastos(gastos);
  const gastoMants = mants.reduce((a, m) => a + (m.costo ?? 0), 0);
  const idsConGastos = new Set(gastos.filter((g) => g.viaje_id).map((g) => g.viaje_id));
  const kmConGastos = viajes.filter((v) => idsConGastos.has(v.id)).reduce((a, v) => a + v.km, 0);
  const gastoEnViajes = gastos.filter((g) => g.viaje_id).reduce((a, g) => a + g.monto, 0);

  // Etiquetas
  const etiquetas = new Map<string, number>();
  for (const v of viajes) for (const t of v.etiquetas ?? []) etiquetas.set(t, (etiquetas.get(t) ?? 0) + 1);
  const topEtiquetas = [...etiquetas.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-5xl font-bold uppercase">Estadísticas</h1>
        <div className="flex flex-wrap gap-2">
          {anios.length > 0 && (
            <BotonTarjeta
              titulo="Mi año en moto"
              etiqueta="Mi año en moto"
              variantes={[...anios].reverse().map(([a]) => ({ label: a, base: "/api/tarjeta/anio/" + a }))}
            />
          )}
          <a href="/api/exportar/backup" download className="btn-ghost py-2" title="Todos tus datos en un archivo JSON">
            <DatabaseBackup className="size-4" /> Copia de seguridad
          </a>
        </div>
      </div>

      {/* Año a año */}
      <section className="card space-y-4 p-6">
        <h2 className="label flex items-center gap-1.5">
          <ChartColumn className="size-3.5" /> Año a año
        </h2>
        <div className="flex h-48 items-end gap-3 overflow-x-auto pb-1">
          {anios.map(([a, x]) => (
            <div key={a} className="group flex h-full min-w-14 flex-1 flex-col items-center justify-end gap-1.5">
              <span className="text-xs font-semibold text-white">{nf.format(x.km / 1000)}k</span>
              <div
                className="w-full max-w-6 rounded-t bg-[#ee5d10] transition group-hover:brightness-125"
                style={{ height: `${Math.max(2, (x.km / maxAnio) * 100)}%` }}
                title={`${a}: ${km(x.km)} en ${x.viajes} viajes`}
              />
              <span className="text-xs text-niebla">{a}</span>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-niebla">
              <tr className="border-b border-linea">
                <th className="py-2 font-medium">Año</th>
                <th className="py-2 text-right font-medium">Km</th>
                <th className="py-2 text-right font-medium">Viajes</th>
                <th className="py-2 text-right font-medium">Días</th>
                <th className="py-2 text-right font-medium">Km/viaje</th>
              </tr>
            </thead>
            <tbody>
              {[...anios].reverse().map(([a, x]) => (
                <tr key={a} className="border-b border-linea/50">
                  <td className="py-2 font-semibold">{a}</td>
                  <td className="py-2 text-right">{num(x.km)}</td>
                  <td className="py-2 text-right">{x.viajes}</td>
                  <td className="py-2 text-right">{x.dias}</td>
                  <td className="py-2 text-right text-niebla">{num(Math.round(x.km / x.viajes))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Récords */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 font-display text-3xl font-bold uppercase">
          <Trophy className="size-6 text-naranja" /> Récords
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {records
            .filter((x) => x.r)
            .map(({ icono: Icono, label, r: rec, fmt }) => (
              <Link key={label} href={`/viajes/${rec!.x.id}`} className="card group space-y-1 p-4 hover:border-niebla/60">
                <p className="flex items-center gap-1.5 text-xs text-niebla">
                  <Icono className="size-3.5" /> {label}
                </p>
                <p className="font-display text-3xl font-bold">{fmt(rec!.v)}</p>
                <p className="truncate text-sm text-niebla group-hover:text-white">
                  {rec!.x.titulo} · {rangoFechas(rec!.x.fecha_inicio, rec!.x.fecha_fin)}
                </p>
              </Link>
            ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Lugares */}
        <section className="card space-y-4 p-6">
          <h2 className="label flex items-center gap-1.5">
            <Globe className="size-3.5" /> Lugares
          </h2>
          {nProvincias ? (
            <>
              <p className="font-display text-4xl font-bold">
                {nProvincias} <span className="text-lg text-niebla">{nProvincias === 1 ? "provincia" : "provincias"}</span>
                {lugares.size > 1 && (
                  <>
                    {" "}· {lugares.size} <span className="text-lg text-niebla">países</span>
                  </>
                )}
              </p>
              {[...lugares.entries()].map(([pais, provs]) => (
                <div key={pais} className="space-y-2">
                  {lugares.size > 1 && <p className="text-sm font-semibold">{pais}</p>}
                  <div className="flex flex-wrap gap-2">
                    {[...provs.entries()]
                      .sort((a, b) => b[1].size - a[1].size)
                      .map(([prov, ids]) => (
                        <span key={prov} className="inline-flex items-center gap-1.5 rounded-full bg-grafito px-3 py-1 text-xs">
                          <MapPinned className="size-3.5 text-naranja" /> {prov}
                          <span className="text-niebla">{ids.size}</span>
                        </span>
                      ))}
                  </div>
                </div>
              ))}
              <MapaProvincias visitadas={[...(lugares.get("Argentina")?.keys() ?? []), ...(lugares.get("—")?.keys() ?? [])]} />
            </>
          ) : (
            <p className="text-sm text-niebla">
              Se completa con el recorrido de cada viaje (abrí el viaje para que lo calcule), las paradas y la ubicación de las fotos.
            </p>
          )}
        </section>

        {/* Gastos */}
        <section className="card space-y-4 p-6">
          <h2 className="label flex items-center gap-1.5">
            <Wallet className="size-3.5" /> Gastos
          </h2>
          {r.total + gastoMants > 0 ? (
            <>
              <p className="font-display text-4xl font-bold">{plata(r.total + gastoMants)}</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {r.litros > 0 && (
                  <Mini icono={Fuel} label="Nafta" valor={`${nf.format(r.litros)} l · ${plata(r.nafta)}`} />
                )}
                {r.precioLitro && <Mini icono={Fuel} label="Precio promedio" valor={`${plata(r.precioLitro)}/l`} />}
                {kmConGastos > 0 && <Mini icono={Route} label="Costo por km en viaje" valor={plata(gastoEnViajes / kmConGastos)} />}
                {gastoMants > 0 && <Mini icono={Gauge} label="Mantenimiento" valor={plata(gastoMants)} />}
              </div>
              <ul className="space-y-1.5 text-sm">
                {r.porTipo.map((t) => (
                  <li key={t.tipo} className="flex justify-between border-b border-linea/50 pb-1.5">
                    <span className="text-niebla">{labelGasto(t.tipo)}</span>
                    <span>{plata(t.total)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-niebla">Cargá gastos en tus viajes o la nafta en Motos y aparecen acá.</p>
          )}
        </section>
      </div>

      {topEtiquetas.length > 0 && (
        <section className="card space-y-3 p-6">
          <h2 className="label flex items-center gap-1.5">
            <Tag className="size-3.5" /> Etiquetas
          </h2>
          <div className="flex flex-wrap gap-2">
            {topEtiquetas.map(([t, n]) => (
              <Link
                key={t}
                href={`/viajes?etiqueta=${encodeURIComponent(t)}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-linea px-3 py-1 text-sm hover:border-naranja"
              >
                {t} <span className="text-xs text-niebla">{n}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <EspacioFotos />
    </div>
  );
}

function Mini({ icono: Icono, label, valor }: { icono: LucideIcon; label: string; valor: string }) {
  return (
    <div className="rounded-xl bg-grafito/60 p-3">
      <p className="flex items-center gap-1 text-xs text-niebla">
        <Icono className="size-3.5" /> {label}
      </p>
      <p className="font-semibold">{valor}</p>
    </div>
  );
}
