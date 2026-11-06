import Link from "next/link";
import { Scale } from "lucide-react";
import { km as fmtKm, num } from "@/lib/format";
import { plata } from "@/lib/gastos";
import type { Gasto, Plan } from "@/lib/types";

/** Lo planeado en el planificador contra lo que realmente pasó en el viaje */
export function PlanVsReal({ plan, kmReal, gastos }: { plan: Plan; kmReal: number; gastos: Gasto[] }) {
  const nafta = gastos.filter((g) => g.tipo === "nafta");
  const litrosReal = nafta.reduce((s, g) => s + Number(g.litros || 0), 0);
  const costoReal = nafta.reduce((s, g) => s + Number(g.monto || 0), 0);

  const filas = [
    { label: "Distancia", plan: plan.km, real: kmReal, fmt: (n: number) => fmtKm(Math.round(n)) },
    { label: "Nafta", plan: plan.litros, real: litrosReal || null, fmt: (n: number) => `${num(Math.round(n))} l` },
    { label: "Costo de nafta", plan: plan.costo, real: costoReal || null, fmt: (n: number) => plata(Math.round(n / 100) * 100) },
  ];

  return (
    <section className="card space-y-3 p-5">
      <h2 className="label flex items-center gap-1.5">
        <Scale className="size-3.5" /> Planeado vs. real
        <Link href={`/planificar?plan=${plan.id}`} className="ml-auto text-xs font-normal normal-case text-naranja hover:underline">
          Ver el plan «{plan.nombre}»
        </Link>
      </h2>
      <div className="grid grid-cols-[auto_1fr_1fr_auto] items-baseline gap-x-4 gap-y-2 text-sm">
        <span />
        <span className="text-xs text-niebla">Planeado</span>
        <span className="text-xs text-niebla">Real</span>
        <span className="text-xs text-niebla">Diferencia</span>
        {filas.map((f) => {
          const dif = f.plan && f.real ? ((f.real - f.plan) / f.plan) * 100 : null;
          return (
            <div key={f.label} className="contents">
              <span className="text-niebla">{f.label}</span>
              <span>{f.plan ? f.fmt(f.plan) : "—"}</span>
              <span className="font-semibold">{f.real ? f.fmt(f.real) : "—"}</span>
              <span className={`text-right text-xs font-semibold ${dif === null ? "text-niebla" : Math.abs(dif) < 5 ? "text-emerald-300" : dif > 0 ? "text-amber-300" : "text-sky-300"}`}>
                {dif === null ? "" : `${dif > 0 ? "+" : ""}${Math.round(dif)} %`}
              </span>
            </div>
          );
        })}
      </div>
      {!litrosReal && <p className="text-xs text-niebla">Cargá la nafta en Gastos (con litros) para comparar consumo y costo.</p>}
    </section>
  );
}
