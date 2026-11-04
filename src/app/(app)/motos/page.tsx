import { getMotos, getViajes } from "@/lib/queries";
import { crearMoto, eliminarMoto } from "@/app/actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { km, num } from "@/lib/format";
import { Motorbike, Plus, Trash2 } from "lucide-react";

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
          const ultimoOdo = suyos.find((v) => v.odometro_fin !== null)?.odometro_fin ?? null;
          return (
            <li key={m.id} className="card flex flex-wrap items-center gap-4 p-5">
              <div className="grid size-12 place-items-center rounded-xl bg-grafito text-naranja">
                <Motorbike className="size-6" />
              </div>
              <div className="min-w-40 flex-1">
                <p className="font-semibold">{m.nombre}</p>
                <p className="text-sm text-niebla">
                  {[m.modelo, m.anio].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-2xl font-bold">{km(kmViajes)}</p>
                <p className="text-xs text-niebla">
                  en {suyos.length} {suyos.length === 1 ? "viaje" : "viajes"}
                  {ultimoOdo !== null && ` · odómetro ${num(ultimoOdo)}`}
                </p>
              </div>
              <ConfirmButton
                action={eliminarMoto.bind(null, m.id)}
                mensaje={`¿Borrar ${m.nombre}? Los viajes quedan, pero sin moto asignada.`}
                className="btn-ghost px-3 py-2 text-red-400"
              >
                <Trash2 className="size-4" />
              </ConfirmButton>
            </li>
          );
        })}
        {!motos.length && <li className="card p-6 text-center text-niebla">Agregá tu primera moto.</li>}
      </ul>

      <form action={crearMoto} className="card space-y-4 p-5 md:p-6">
        <h2 className="font-display text-2xl font-bold uppercase">Agregar moto</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="nombre">Nombre *</label>
            <input id="nombre" name="nombre" required placeholder="La Negra" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="modelo">Modelo</label>
            <input id="modelo" name="modelo" placeholder="Honda XR 250 Tornado" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="anio">Año</label>
            <input id="anio" name="anio" inputMode="numeric" placeholder="2021" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="km_iniciales">Km al empezar a registrar</label>
            <input id="km_iniciales" name="km_iniciales" inputMode="numeric" placeholder="0" className="input" />
          </div>
        </div>
        <div className="flex justify-end">
          <button className="btn-primary">
            <Plus className="size-4" /> Agregar
          </button>
        </div>
      </form>
    </div>
  );
}
