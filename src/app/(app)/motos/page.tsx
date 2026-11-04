import { getMotos, getViajes } from "@/lib/queries";
import { actualizarMoto, crearMoto, eliminarMoto } from "@/app/actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { MotoForm } from "@/components/MotoForm";
import { km, num } from "@/lib/format";
import { Gauge, Motorbike, Pencil, Trash2 } from "lucide-react";

export const metadata = { title: "Motos" };

export default async function MotosPage() {
  const [motos, viajes] = await Promise.all([getMotos(), getViajes()]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <h1 className="font-display text-5xl font-bold uppercase">Motos</h1>

      <ul className="space-y-3">
        {motos.map((m) => {
          const suyos = viajes.filter((v) => v.moto_id === m.id);
          const kmViajes = suyos.reduce((a, v) => a + v.km, 0);
          // Viajes vienen ordenados del más nuevo al más viejo
          const ultimoOdo = suyos.find((v) => v.odometro_fin !== null)?.odometro_fin ?? null;
          const odoEstimado = ultimoOdo ?? (m.km_iniciales ? m.km_iniciales + kmViajes : null);
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
                <div className="text-right">
                  <p className="font-display text-2xl font-bold">{km(kmViajes)}</p>
                  <p className="text-xs text-niebla">
                    en {suyos.length} {suyos.length === 1 ? "viaje" : "viajes"}
                  </p>
                  {odoEstimado !== null && (
                    <p className="mt-0.5 flex items-center justify-end gap-1 text-xs text-niebla">
                      <Gauge className="size-3.5" /> {ultimoOdo !== null ? "odómetro" : "≈ odómetro"} {num(odoEstimado)}
                    </p>
                  )}
                </div>
                <ConfirmButton
                  action={eliminarMoto.bind(null, m.id)}
                  mensaje={`¿Borrar ${m.nombre}? Los viajes quedan, pero sin moto asignada.`}
                  className="btn-ghost px-3 py-2 text-red-400"
                >
                  <Trash2 className="size-4" />
                </ConfirmButton>
              </div>
              <details className="group border-t border-linea">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm text-niebla hover:text-white [&::-webkit-details-marker]:hidden">
                  <Pencil className="size-3.5" /> Editar
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
