import Link from "next/link";
import { BriefcaseBusiness, Clock, Gauge, Map as MapIcon, Plus, Route, TrendingUp, Wallet } from "lucide-react";
import { getGastos, getJornadas } from "@/lib/queries";
import { horasTxt, lunesDe, totalesJornadas, type Totales } from "@/lib/jornadas";
import { plata } from "@/lib/gastos";
import { fecha, km, num } from "@/lib/format";
import { reducir } from "@/lib/recorrido";
import { hoyAR } from "@/lib/recuerdos";
import { MapaZonasLazy } from "@/components/mapas";

export const metadata = { title: "Jornadas" };

const PERIODOS = [
  { k: "semana", label: "Esta semana" },
  { k: "mes", label: "Este mes" },
  { k: "todo", label: "Todo" },
] as const;

export default async function JornadasPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { periodo: p = "semana" } = await searchParams;
  const periodo = PERIODOS.some((x) => x.k === p) ? p : "semana";
  const [todas, gastos] = await Promise.all([getJornadas().catch(() => null), getGastos().catch(() => [])]);

  if (todas === null) {
    return (
      <div className="card mx-auto max-w-lg space-y-3 p-8 text-center">
        <p className="text-niebla">Falta crear la tabla de jornadas en la base (supabase/migracion-2026-11-12.sql).</p>
      </div>
    );
  }

  const hoy = hoyAR();
  const desde = periodo === "semana" ? lunesDe(hoy) : periodo === "mes" ? `${hoy.slice(0, 7)}-01` : "0000";
  const delPeriodo = todas.filter((j) => j.fecha >= desde);
  const t = totalesJornadas(delPeriodo, gastos);

  // Últimas 8 semanas
  const semanas = new Map<string, typeof todas>();
  for (const j of todas) {
    const s = lunesDe(j.fecha);
    semanas.set(s, [...(semanas.get(s) ?? []), j]);
  }
  const porSemana = [...semanas.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 8)
    .map(([s, js]) => ({ s, t: totalesJornadas(js, gastos) }));
  const maxNeto = Math.max(1, ...porSemana.map((x) => Math.abs(x.t.neto)));

  const recorridos = delPeriodo.filter((j) => j.recorrido && j.recorrido.length > 1).map((j) => reducir(j.recorrido!, 300));
  const gastoDe = (id: string) => gastos.filter((g) => g.jornada_id === id).reduce((a, g) => a + g.monto, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-5xl font-bold uppercase">Jornadas</h1>
          <p className="text-sm text-niebla">Lo que trabajás con la moto: km, horas, lo que ganás y lo que gastás.</p>
        </div>
        <Link href="/jornadas/nueva" className="btn-primary">
          <Plus className="size-4" /> Nueva jornada
        </Link>
      </div>

      <div className="flex gap-2">
        {PERIODOS.map((x) => (
          <Link
            key={x.k}
            href={`/jornadas?periodo=${x.k}`}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${periodo === x.k ? "border-naranja bg-naranja text-black" : "border-linea text-niebla"}`}
          >
            {x.label}
          </Link>
        ))}
      </div>

      <Resumen t={t} />

      {porSemana.length > 1 && (
        <section className="card space-y-3 p-5">
          <h2 className="label flex items-center gap-1.5">
            <TrendingUp className="size-3.5" /> Por semana
          </h2>
          <ul className="space-y-2">
            {porSemana.map(({ s, t: x }) => (
              <li key={s} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 text-sm">
                <span className="text-xs text-niebla">{fecha(s, { year: undefined })}</span>
                <span className="h-2 overflow-hidden rounded-full bg-white/5">
                  <span className={`block h-full ${x.neto >= 0 ? "bg-naranja" : "bg-red-500"}`} style={{ width: `${(Math.abs(x.neto) / maxNeto) * 100}%` }} />
                </span>
                <span className="text-right">
                  <b>{plata(x.neto)}</b> <span className="text-xs text-niebla">· {num(Math.round(x.km))} km · {horasTxt(x.minutos)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recorridos.length > 0 && (
        <section className="space-y-2">
          <h2 className="label flex items-center gap-1.5">
            <MapIcon className="size-3.5" /> Por dónde anduviste · las calles más marcadas son las que más usás
          </h2>
          <div className="h-80 overflow-hidden rounded-2xl border border-linea md:h-[28rem]">
            <MapaZonasLazy recorridos={recorridos} />
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-3xl font-bold uppercase">Jornadas</h2>
        {!todas.length ? (
          <div className="card space-y-3 p-8 text-center text-niebla">
            <BriefcaseBusiness className="mx-auto size-10" strokeWidth={1.5} />
            <p>Todavía no cargaste jornadas. Cargá la de hoy: km, horario y lo que ganaste.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {todas.slice(0, 60).map((j) => {
              const neto = Number(j.ingresos || 0) + Number(j.propinas || 0) - gastoDe(j.id);
              return (
                <li key={j.id}>
                  <Link href={`/jornadas/${j.id}`} className="card flex items-center gap-3 p-3 transition hover:border-naranja/60">
                    <div className="w-14 shrink-0 text-center">
                      <p className="font-display text-2xl leading-none font-bold">{j.fecha.slice(8, 10)}</p>
                      <p className="text-[11px] text-niebla uppercase">{fecha(j.fecha, { day: undefined, month: undefined, year: undefined, weekday: "short" })} {fecha(j.fecha, { day: undefined, year: undefined })}</p>
                    </div>
                    <div className="min-w-0 flex-1 text-sm">
                      <p>
                        <b>{km(Math.round(j.km))}</b> · {horasTxt(j.minutos_total)}
                        {j.viajes ? ` · ${j.viajes} viajes` : ""}
                      </p>
                      {j.notas && <p className="truncate text-xs text-niebla">{j.notas}</p>}
                    </div>
                    {j.ingresos !== null && (
                      <p className={`shrink-0 font-display text-xl font-bold ${neto >= 0 ? "text-naranja" : "text-red-400"}`}>{plata(neto)}</p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Resumen({ t }: { t: Totales }) {
  const caja = (icono: React.ReactNode, label: string, valor: string, destacado = false) => (
    <div className="rounded-xl bg-grafito/60 p-3">
      <p className="flex items-center gap-1.5 text-xs text-niebla">
        {icono} {label}
      </p>
      <p className={`font-display text-2xl font-bold ${destacado ? "text-naranja" : ""}`}>{valor}</p>
    </div>
  );
  return (
    <section className="card space-y-3 p-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {caja(<Wallet className="size-3.5" />, "Ganancia neta", plata(t.neto), true)}
        {caja(<TrendingUp className="size-3.5" />, "Ganado", plata(t.ingresos))}
        {caja(<Wallet className="size-3.5" />, "Gastos", plata(t.gastos))}
        {caja(<Route className="size-3.5" />, "Km", num(Math.round(t.km)))}
        {caja(<Clock className="size-3.5" />, "Horas", horasTxt(t.minutos))}
        {caja(<Gauge className="size-3.5" />, "Neto por km", t.porKm !== null ? plata(t.porKm) : "—")}
        {caja(<Clock className="size-3.5" />, "Neto por hora", t.porHora !== null ? plata(t.porHora) : "—")}
        {caja(<BriefcaseBusiness className="size-3.5" />, "Jornadas · viajes", `${t.jornadas}${t.viajes ? ` · ${t.viajes}` : ""}`)}
      </div>
      {t.gastos > 0 && <p className="text-xs text-niebla">De los gastos, {plata(t.nafta)} son de nafta.</p>}
    </section>
  );
}
