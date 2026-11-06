import Link from "next/link";
import { CalendarCheck, FilePlus2, Route } from "lucide-react";
import { getGastos, getMotos, getPlanes } from "@/lib/queries";
import { consumoTanqueLleno, plata } from "@/lib/gastos";
import { fecha, km } from "@/lib/format";
import { Planificador, type MotoPlan } from "@/components/Planificador";
import { BorrarPlan } from "@/components/BorrarPlan";

export const metadata = { title: "Planificar viaje" };

export default async function PlanificarPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan: planId } = await searchParams;
  const [motos, gastos, planes] = await Promise.all([getMotos(), getGastos().catch(() => []), getPlanes().catch(() => [])]);
  const nafta = gastos.filter((g) => g.tipo === "nafta" && g.litros && g.monto > 0);

  // Por moto: consumo real (tanque lleno) y último precio de la nafta que cargaste
  const datos: MotoPlan[] = motos.map((m) => {
    const propias = nafta.filter((g) => g.moto_id === m.id);
    return { id: m.id, nombre: m.nombre, tanque: m.tanque_litros ?? null, consumo: consumoTanqueLleno(propias) };
  });
  const ultima = nafta[0]; // getGastos viene ordenado por fecha, más nuevo primero
  const precio = ultima ? Math.round(ultima.monto / Number(ultima.litros)) : null;
  const plan = planes.find((p) => p.id === planId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-5xl font-bold uppercase">Planificar</h1>
          <p className="text-sm text-niebla">
            {plan ? `Plan: ${plan.nombre}` : "Marcá la ruta y te calculo la nafta, el costo, la altura y los tramos sin estaciones."}
          </p>
        </div>
        {plan && (
          <Link href="/planificar" className="btn-ghost py-2">
            <FilePlus2 className="size-4" /> Plan nuevo
          </Link>
        )}
      </div>

      {planes.length > 0 && (
        <section className="space-y-2">
          <h2 className="label flex items-center gap-1.5">
            <Route className="size-3.5" /> Planes guardados
          </h2>
          <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:px-0">
            {planes.map((p) => (
              <li
                key={p.id}
                className={`card relative w-64 shrink-0 space-y-1 p-3 md:w-auto ${p.id === plan?.id ? "border-naranja" : ""}`}
              >
                <Link href={`/planificar?plan=${p.id}`} className="block space-y-1 pr-8">
                  <p className="truncate font-semibold">{p.nombre}</p>
                  <p className="text-xs text-niebla">
                    {km(Math.round(p.km))}
                    {p.costo ? ` · ${plata(Math.round(p.costo / 100) * 100)}` : ""} · {fecha(p.created_at.slice(0, 10))}
                  </p>
                </Link>
                {p.viaje_id && (
                  <Link href={`/viajes/${p.viaje_id}`} className="inline-flex items-center gap-1 text-xs text-emerald-300 hover:underline">
                    <CalendarCheck className="size-3.5" /> Hecho · ver el viaje
                  </Link>
                )}
                <BorrarPlan id={p.id} nombre={p.nombre} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <Planificador key={plan?.id ?? "nuevo"} motos={datos} precio={precio} plan={plan} />
    </div>
  );
}
