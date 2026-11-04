import { getGastos, getMantenimientos, getMotos, getViajes } from "@/lib/queries";
import { actualizarMoto, crearMoto, eliminarMoto } from "@/app/actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { MotoForm } from "@/components/MotoForm";
import { PanelGastos } from "@/components/PanelGastos";
import { PanelMantenimiento } from "@/components/PanelMantenimiento";
import { km, num } from "@/lib/format";
import { consumoTanqueLleno, plata } from "@/lib/gastos";
import { estadosMantenimiento, odometroActual } from "@/lib/mantenimiento";
import { Fuel, Gauge, Motorbike, Pencil, Trash2, TriangleAlert, Wrench } from "lucide-react";

export const metadata = { title: "Motos" };

const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

export default async function MotosPage() {
  const [motos, viajes, gastos, mants] = await Promise.all([getMotos(), getViajes(), getGastos(), getMantenimientos()]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <h1 className="font-display text-5xl font-bold uppercase">Motos</h1>

      <ul className="space-y-4">
        {motos.map((m) => {
          const suyos = viajes.filter((v) => v.moto_id === m.id);
          const kmViajes = suyos.reduce((a, v) => a + v.km, 0);
          const odo = odometroActual(m, viajes, gastos, mants);
          const cargas = gastos.filter((g) => g.moto_id === m.id && g.tipo === "nafta");
          const consumo = consumoTanqueLleno(cargas);
          const susMants = mants.filter((x) => x.moto_id === m.id);
          const alertas = estadosMantenimiento(susMants, odo).filter((e) => e.estado === "vencido" || e.estado === "pronto");
          const gastoTotal = gastos.filter((g) => g.moto_id === m.id).reduce((a, g) => a + g.monto, 0) +
            susMants.reduce((a, x) => a + (x.costo ?? 0), 0);

          return (
            <li key={m.id} className="card overflow-hidden">
              <div className="flex flex-wrap items-center gap-4 p-5">
                <div className="grid size-12 place-items-center rounded-xl bg-grafito text-naranja">
                  <Motorbike className="size-6" />
                </div>
                <div className="min-w-40 flex-1">
                  <p className="font-semibold">{m.nombre}</p>
                  <p className="text-sm text-niebla">{[m.modelo, m.anio].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                <ConfirmButton
                  action={eliminarMoto.bind(null, m.id)}
                  mensaje={`¿Borrar ${m.nombre}? Se borran su mantenimiento; los viajes quedan sin moto asignada.`}
                  className="btn-ghost px-3 py-2 text-red-400"
                >
                  <Trash2 className="size-4" />
                </ConfirmButton>
              </div>

              <div className="grid grid-cols-2 gap-px border-t border-linea bg-linea sm:grid-cols-4">
                <Dato label={`En ${suyos.length} ${suyos.length === 1 ? "viaje" : "viajes"}`} valor={km(kmViajes)} />
                <Dato icono={<Gauge className="size-3.5" />} label="Odómetro" valor={odo !== null ? num(odo) : "—"} />
                <Dato icono={<Fuel className="size-3.5" />} label="Consumo" valor={consumo ? `${nf.format(consumo)} km/l` : "—"} />
                <Dato label="Gastado" valor={gastoTotal ? plata(gastoTotal) : "—"} />
              </div>

              {alertas.length > 0 && (
                <div className="flex flex-wrap gap-2 border-t border-linea px-5 py-3">
                  {alertas.map((a) => (
                    <span
                      key={a.tipo}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                        a.estado === "vencido" ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-200"
                      }`}
                    >
                      <TriangleAlert className="size-3.5" /> {a.label}
                    </span>
                  ))}
                </div>
              )}

              <details className="group border-t border-linea" open={alertas.length > 0}>
                <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm text-niebla hover:text-white [&::-webkit-details-marker]:hidden">
                  <Wrench className="size-3.5" /> Mantenimiento
                </summary>
                <div className="px-5 pb-5">
                  <PanelMantenimiento motoId={m.id} mants={susMants} odometro={odo} />
                </div>
              </details>
              <details className="group border-t border-linea">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm text-niebla hover:text-white [&::-webkit-details-marker]:hidden">
                  <Fuel className="size-3.5" /> Cargas de nafta {cargas.length > 0 && <span className="text-xs">({cargas.length})</span>}
                </summary>
                <div className="px-5 pb-5">
                  <p className="mb-3 text-xs text-niebla">
                    Para el consumo real cargá el tanque lleno y anotá el odómetro. Se calcula entre dos cargas llenas.
                  </p>
                  <PanelGastos gastos={cargas} motoId={m.id} soloNafta />
                </div>
              </details>
              <details className="group border-t border-linea">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm text-niebla hover:text-white [&::-webkit-details-marker]:hidden">
                  <Pencil className="size-3.5" /> Editar datos
                </summary>
                <div className="px-5 pb-5">
                  <MotoForm action={actualizarMoto.bind(null, m.id)} moto={m} />
                </div>
              </details>
            </li>
          );
        })}
        {!motos.length && <li className="card p-6 text-center text-niebla">Agregá tu primera moto.</li>}
      </ul>

      <section className="card space-y-4 p-5 md:p-6">
        <h2 className="font-display text-2xl font-bold uppercase">Agregar moto</h2>
        <MotoForm action={crearMoto} />
      </section>
    </div>
  );
}

function Dato({ label, valor, icono }: { label: string; valor: string; icono?: React.ReactNode }) {
  return (
    <div className="bg-carbon px-4 py-3">
      <p className="flex items-center gap-1 text-xs text-niebla">
        {icono} {label}
      </p>
      <p className="font-display text-xl font-bold">{valor}</p>
    </div>
  );
}
