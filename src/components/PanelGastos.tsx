"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CircleAlert,
  Fuel,
  Hotel,
  LoaderCircle,
  Plus,
  Receipt,
  Trash2,
  Utensils,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { crearGasto, eliminarGasto } from "@/app/acciones-extra";
import { TIPOS_GASTO, consumoViaje, labelGasto, plata, resumirGastos } from "@/lib/gastos";
import { fecha as fmtFecha } from "@/lib/format";
import type { Gasto, Moto, TipoGasto } from "@/lib/types";

const ICONOS: Record<TipoGasto, LucideIcon> = {
  nafta: Fuel,
  peaje: Receipt,
  comida: Utensils,
  alojamiento: Hotel,
  repuestos: Wrench,
  otro: Receipt,
};

const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

export function PanelGastos({
  gastos: gastosServidor,
  viajeId,
  motoId,
  motos,
  kmViaje,
  fechaDefault,
  soloNafta = false,
}: {
  gastos: Gasto[];
  viajeId?: string;
  motoId?: string | null;
  motos?: Pick<Moto, "id" | "nombre">[];
  /** Si es de un viaje: para calcular el consumo */
  kmViaje?: number;
  fechaDefault?: string;
  /** Panel de una moto: solo cargas de nafta */
  soloNafta?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<TipoGasto>("nafta");
  const [estado, enviar, pendiente] = useActionState(crearGasto, undefined);
  // Lista local: lo que llega del servidor + lo recién creado − lo borrado (no depende de que la página se refresque)
  const [nuevos, setNuevos] = useState<Gasto[]>([]);
  const [borrados, setBorrados] = useState<string[]>([]);
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (estado?.ok) {
      if (estado.gasto) setNuevos((n) => [estado.gasto!, ...n]);
      // Traer la lista actualizada (revalidatePath sola no refresca la vista desde useActionState)
      router.refresh();
      form.current?.reset();
      setTipo("nafta");
      setAbierto(false);
    }
  }, [estado]);

  const ids = new Set(gastosServidor.map((g) => g.id));
  const gastos = [...nuevos.filter((g) => !ids.has(g.id)), ...gastosServidor]
    .filter((g) => !borrados.includes(g.id))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at));
  const r = resumirGastos(gastos);
  const consumo = kmViaje ? consumoViaje(kmViaje, gastos) : null;

  return (
    <div className="space-y-4">
      {gastos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Mini label={soloNafta ? "Gastado en nafta" : "Total"} valor={plata(r.total)} destacado />
          {r.litros > 0 && <Mini label="Litros" valor={`${nf.format(r.litros)} l`} />}
          {r.precioLitro && <Mini label="Precio promedio" valor={`${plata(r.precioLitro)}/l`} />}
          {consumo && <Mini label="Consumo" valor={`${nf.format(consumo)} km/l`} />}
          {kmViaje && r.total > 0 && <Mini label="Costo por km" valor={plata(r.total / kmViaje)} />}
        </div>
      )}

      {!soloNafta && r.porTipo.length > 1 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {r.porTipo.map((t) => {
            const Icono = ICONOS[t.tipo];
            return (
              <span key={t.tipo} className="inline-flex items-center gap-1.5 rounded-full bg-grafito px-3 py-1 text-niebla">
                <Icono className="size-3.5" /> {labelGasto(t.tipo)} <b className="text-white">{plata(t.total)}</b>
              </span>
            );
          })}
        </div>
      )}

      {gastos.length > 0 && (
        <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea">
          {gastos.map((g) => {
            const Icono = ICONOS[g.tipo] ?? Receipt;
            return (
              <li key={g.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-grafito text-naranja">
                  <Icono className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    {labelGasto(g.tipo)}
                    {g.litros ? ` · ${nf.format(g.litros)} l` : ""}
                    {g.lugar ? <span className="text-niebla"> · {g.lugar}</span> : null}
                  </p>
                  <p className="text-xs text-niebla">
                    {fmtFecha(g.fecha)}
                    {g.odometro !== null && ` · odómetro ${nf.format(g.odometro)}`}
                    {g.tipo === "nafta" && !g.lleno && " · carga parcial"}
                  </p>
                </div>
                <span className="font-semibold">{plata(g.monto)}</span>
                <button
                  type="button"
                  onClick={() => confirm("¿Borrar este gasto?") && startTransition(async () => {
                    await eliminarGasto(g.id);
                    setBorrados((b) => [...b, g.id]);
                    router.refresh();
                  })}
                  className="grid size-7 place-items-center rounded-md text-niebla hover:bg-grafito hover:text-red-400"
                  title="Borrar"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!abierto ? (
        <button type="button" onClick={() => setAbierto(true)} className="btn-ghost">
          <Plus className="size-4" /> {soloNafta ? "Cargar nafta" : "Agregar gasto"}
        </button>
      ) : (
        <form
          ref={form}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(() => enviar(fd));
          }}
          className="space-y-3 rounded-xl border border-linea p-4"
        >
          {viajeId && <input type="hidden" name="viaje_id" value={viajeId} />}
          {soloNafta ? (
            <input type="hidden" name="tipo" value="nafta" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {TIPOS_GASTO.map((t) => {
                const Icono = ICONOS[t.valor];
                return (
                  <label
                    key={t.valor}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                      tipo === t.valor ? "border-naranja bg-naranja/15 text-naranja" : "border-linea text-niebla"
                    }`}
                  >
                    <input type="radio" name="tipo" value={t.valor} checked={tipo === t.valor} onChange={() => setTipo(t.valor)} className="sr-only" />
                    <Icono className="size-3.5" /> {t.label}
                  </label>
                );
              })}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Campo label="Monto $" name="monto" placeholder="15000" decimal />
            {(soloNafta || tipo === "nafta") && <Campo label="Litros" name="litros" placeholder="12,5" decimal />}
            <div>
              <label className="label">Fecha</label>
              <input name="fecha" type="date" defaultValue={fechaDefault ?? new Date().toISOString().slice(0, 10)} className="input" />
            </div>
            {(soloNafta || tipo === "nafta") && <Campo label="Odómetro" name="odometro" placeholder="12850" />}
            <Campo label="Lugar" name="lugar" placeholder="YPF Belén" />
            {motos && motos.length > 0 && !motoId && (
              <div>
                <label className="label">Moto</label>
                <select name="moto_id" className="input" defaultValue={motos[0]?.id}>
                  {motos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {motoId && <input type="hidden" name="moto_id" value={motoId} />}
          </div>
          {(soloNafta || tipo === "nafta") && (
            <label className="flex items-center gap-2 text-sm text-niebla">
              <input type="checkbox" name="lleno" defaultChecked className="size-4 accent-[var(--color-naranja)]" />
              Llené el tanque <span className="text-xs">(para calcular el consumo real)</span>
            </label>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {estado?.error && (
              <p className="mr-auto flex items-center gap-1.5 text-sm text-red-400">
                <CircleAlert className="size-4" /> {estado.error}
              </p>
            )}
            <button type="button" onClick={() => setAbierto(false)} className="btn-ghost">
              <X className="size-4" /> Cancelar
            </button>
            <button disabled={pendiente} className="btn-primary">
              {pendiente ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Guardar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Campo({ label, name, placeholder, decimal }: { label: string; name: string; placeholder?: string; decimal?: boolean }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input name={name} inputMode={decimal ? "decimal" : "numeric"} placeholder={placeholder} className="input" />
    </div>
  );
}

function Mini({ label, valor, destacado }: { label: string; valor: string; destacado?: boolean }) {
  return (
    <div className="rounded-xl bg-grafito/60 p-3">
      <p className="text-xs text-niebla">{label}</p>
      <p className={`font-display text-xl font-bold ${destacado ? "text-naranja" : ""}`}>{valor}</p>
    </div>
  );
}
