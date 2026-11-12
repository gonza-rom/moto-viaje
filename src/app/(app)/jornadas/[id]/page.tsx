import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Gauge, Map as MapIcon, Pencil, Route, Trash2, TrendingUp, Wallet } from "lucide-react";
import { getGastos, getJornada, getMotos } from "@/lib/queries";
import { horasTxt, totalesJornadas } from "@/lib/jornadas";
import { plata } from "@/lib/gastos";
import { fecha, km, num } from "@/lib/format";
import { MapaRutaLazy } from "@/components/mapas";
import { PanelGastos } from "@/components/PanelGastos";
import { ConfirmButton } from "@/components/ConfirmButton";
import { borrarJornada } from "@/app/acciones-extra";
import type { Ruta } from "@/lib/ruta";

export const metadata = { title: "Jornada" };

const horaAR = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) : null;

export default async function JornadaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [j, gastos, motos] = await Promise.all([getJornada(id), getGastos({ jornadaId: id }).catch(() => []), getMotos()]);
  if (!j) notFound();
  const t = totalesJornadas([j], gastos);
  const moto = motos.find((m) => m.id === j.moto_id);
  // El mapa de la ruta espera una Ruta: se arma una sin paradas con el recorrido grabado
  const ruta: Ruta | null =
    j.recorrido && j.recorrido.length > 1
      ? { modo: "calle", paradas: [], trazo: j.recorrido, km: j.km }
      : null;

  const dato = (icono: React.ReactNode, label: string, valor: string, destacado = false) => (
    <div className="rounded-xl bg-grafito/60 p-3">
      <p className="flex items-center gap-1.5 text-xs text-niebla">
        {icono} {label}
      </p>
      <p className={`font-display text-2xl font-bold ${destacado ? "text-naranja" : ""}`}>{valor}</p>
    </div>
  );

  return (
    <article className="space-y-6">
      <Link href="/jornadas" className="inline-flex items-center gap-1.5 text-sm text-niebla hover:text-white">
        <ArrowLeft className="size-4" /> Jornadas
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-bold uppercase">{fecha(j.fecha, { weekday: "long" })}</h1>
          <p className="text-sm text-niebla">
            {[horaAR(j.inicio) && horaAR(j.fin) ? `${horaAR(j.inicio)} a ${horaAR(j.fin)}` : null, moto?.nombre].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Link href={`/jornadas/${j.id}/editar`} className="btn-ghost">
          <Pencil className="size-4" /> Editar
        </Link>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {dato(<Wallet className="size-3.5" />, "Ganancia neta", j.ingresos !== null ? plata(t.neto) : "—", true)}
        {dato(<TrendingUp className="size-3.5" />, "Ganado", j.ingresos !== null ? plata(t.ingresos) : "—")}
        {dato(<Route className="size-3.5" />, "Km", km(Math.round(j.km)))}
        {dato(<Clock className="size-3.5" />, "Horas", horasTxt(j.minutos_total))}
        {j.minutos_movimiento !== null && dato(<Clock className="size-3.5" />, "En movimiento", horasTxt(j.minutos_movimiento))}
        {t.porKm !== null && dato(<Gauge className="size-3.5" />, "Neto por km", plata(t.porKm))}
        {t.porHora !== null && dato(<Clock className="size-3.5" />, "Neto por hora", plata(t.porHora))}
        {j.viajes ? dato(<Route className="size-3.5" />, "Viajes", num(j.viajes)) : null}
      </section>

      {j.notas && <p className="card p-4 text-sm whitespace-pre-line">{j.notas}</p>}

      {ruta && (
        <section className="space-y-2">
          <h2 className="label flex items-center gap-1.5">
            <MapIcon className="size-3.5" /> Recorrido
          </h2>
          <div className="h-80 overflow-hidden rounded-2xl border border-linea md:h-[28rem]">
            <MapaRutaLazy ruta={ruta} />
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-display text-3xl font-bold uppercase">
          <Wallet className="size-6 text-naranja" /> Gastos
        </h2>
        <PanelGastos gastos={gastos} jornadaId={j.id} motoId={j.moto_id} kmViaje={j.km || undefined} fechaDefault={j.fecha} />
      </section>

      <footer className="flex justify-end border-t border-linea pt-4">
        <ConfirmButton action={borrarJornada.bind(null, j.id)} mensaje="¿Borrar esta jornada y sus gastos?">
          <Trash2 className="size-4" /> Borrar jornada
        </ConfirmButton>
      </footer>
    </article>
  );
}
