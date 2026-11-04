"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, CircleCheck, Clock, LoaderCircle, Plus, Trash2, TriangleAlert, Wrench, X } from "lucide-react";
import { crearMantenimiento, eliminarMantenimiento } from "@/app/acciones-extra";
import { TIPOS_MANT, estadosMantenimiento, labelMant, textoFalta } from "@/lib/mantenimiento";
import { plata } from "@/lib/gastos";
import { fecha as fmtFecha } from "@/lib/format";
import type { Mantenimiento } from "@/lib/types";

const nf = new Intl.NumberFormat("es-AR");

const COLOR = {
  vencido: "border-red-500/40 bg-red-500/10 text-red-300",
  pronto: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  ok: "border-linea bg-grafito/40 text-white",
  "sin-dato": "border-linea bg-grafito/40 text-niebla",
};
const ICONO = { vencido: TriangleAlert, pronto: Clock, ok: CircleCheck, "sin-dato": Wrench };

export function PanelMantenimiento({
  motoId,
  mants: mantsServidor,
  odometro,
}: {
  motoId: string;
  mants: Mantenimiento[];
  odometro: number | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState("aceite");
  const [verHistorial, setVerHistorial] = useState(false);
  const [estado, enviar, pendiente] = useActionState(crearMantenimiento, undefined);
  const [nuevos, setNuevos] = useState<Mantenimiento[]>([]);
  const [borrados, setBorrados] = useState<string[]>([]);
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const sugerido = TIPOS_MANT.find((t) => t.valor === tipo);

  useEffect(() => {
    if (estado?.ok) {
      if (estado.mant) setNuevos((n) => [estado.mant!, ...n]);
      // Traer la lista actualizada (revalidatePath sola no refresca la vista desde useActionState)
      router.refresh();
      form.current?.reset();
      setAbierto(false);
    }
  }, [estado]);

  const ids = new Set(mantsServidor.map((x) => x.id));
  const mants = [...nuevos.filter((x) => !ids.has(x.id)), ...mantsServidor]
    .filter((x) => !borrados.includes(x.id))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const estados = estadosMantenimiento(mants, odometro);

  return (
    <div className="space-y-3">
      {estados.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {estados.map((e) => {
            const Icono = ICONO[e.estado];
            return (
              <li key={e.tipo} className={`flex items-start gap-2.5 rounded-xl border p-3 text-sm ${COLOR[e.estado]}`}>
                <Icono className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">{e.label}</p>
                  <p className="text-xs opacity-80">{textoFalta(e)}</p>
                  <p className="text-[11px] opacity-60">
                    Último: {fmtFecha(e.ultimo.fecha)}
                    {e.ultimo.odometro !== null && ` · ${nf.format(e.ultimo.odometro)} km`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-niebla">
          Registrá el último cambio de aceite, service, cubiertas… y te aviso cuándo toca el próximo.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!abierto && (
          <button type="button" onClick={() => setAbierto(true)} className="btn-ghost">
            <Plus className="size-4" /> Registrar mantenimiento
          </button>
        )}
        {mants.length > 0 && !abierto && (
          <button type="button" onClick={() => setVerHistorial((v) => !v)} className="btn-ghost text-niebla">
            {verHistorial ? "Ocultar historial" : `Historial (${mants.length})`}
          </button>
        )}
      </div>

      {verHistorial && (
        <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea text-sm">
          {mants.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate">{labelMant(m.tipo)}</p>
                <p className="text-xs text-niebla">
                  {fmtFecha(m.fecha)}
                  {m.odometro !== null && ` · ${nf.format(m.odometro)} km`}
                  {m.notas && ` · ${m.notas}`}
                </p>
              </div>
              {m.costo !== null && <span className="text-niebla">{plata(m.costo)}</span>}
              <button
                type="button"
                onClick={() => confirm("¿Borrar este registro?") && startTransition(async () => {
                    await eliminarMantenimiento(m.id);
                    setBorrados((b) => [...b, m.id]);
                    router.refresh();
                  })}
                className="grid size-7 place-items-center rounded-md text-niebla hover:bg-grafito hover:text-red-400"
                title="Borrar"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {abierto && (
        <form
          ref={form}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(() => enviar(fd));
          }}
          className="space-y-3 rounded-xl border border-linea p-4"
        >
          <input type="hidden" name="moto_id" value={motoId} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-3">
              <label className="label">Qué se hizo</label>
              <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className="input">
                {TIPOS_MANT.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Fecha</label>
              <input name="fecha" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="input" />
            </div>
            <div>
              <label className="label">Odómetro</label>
              <input name="odometro" inputMode="numeric" defaultValue={odometro ?? ""} className="input" />
            </div>
            <div>
              <label className="label">Costo $</label>
              <input name="costo" inputMode="decimal" className="input" />
            </div>
            {/* key: al cambiar el tipo se reponen los intervalos sugeridos */}
            <div key={`km-${tipo}`}>
              <label className="label">Próximo en (km)</label>
              <input name="cada_km" inputMode="numeric" defaultValue={sugerido?.km ?? ""} placeholder="—" className="input" />
            </div>
            <div key={`m-${tipo}`}>
              <label className="label">o en (meses)</label>
              <input name="cada_meses" inputMode="numeric" defaultValue={sugerido?.meses ?? ""} placeholder="—" className="input" />
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label className="label">Notas</label>
              <input name="notas" placeholder="Motul 10W40, taller X…" className="input" />
            </div>
          </div>
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
