"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { Check, CircleAlert, LoaderCircle, Plus, Save } from "lucide-react";
import type { Estado } from "@/app/actions";
import type { Moto } from "@/lib/types";

function Boton({ pending, editando }: { pending: boolean; editando: boolean }) {
  return (
    <button disabled={pending} className="btn-primary">
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : editando ? (
        <Save className="size-4" />
      ) : (
        <Plus className="size-4" />
      )}
      {editando ? "Guardar" : "Agregar"}
    </button>
  );
}

export function MotoForm({
  action,
  moto,
  onListo,
}: {
  action: (prev: Estado, fd: FormData) => Promise<Estado>;
  moto?: Moto;
  onListo?: () => void;
}) {
  const [estado, enviar, pendiente] = useActionState(action, undefined);
  const form = useRef<HTMLFormElement>(null);
  const id = moto?.id ?? "nueva";

  useEffect(() => {
    if (!estado?.ok) return;
    // Recarga completa: la tarjeta de la moto se arma en el servidor y router.refresh() no siempre la repinta
    setTimeout(() => window.location.reload(), 600);
    if (!moto) form.current?.reset();
    onListo?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  return (
    <form
      ref={form}
      // Envío manual: con `action=` React vacía el formulario aunque haya error
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => enviar(fd));
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`nombre-${id}`}>Nombre *</label>
          <input id={`nombre-${id}`} name="nombre" required defaultValue={moto?.nombre} placeholder="La Negra" className="input" />
        </div>
        <div>
          <label className="label" htmlFor={`modelo-${id}`}>Modelo</label>
          <input id={`modelo-${id}`} name="modelo" defaultValue={moto?.modelo ?? ""} placeholder="Honda XR 250 Tornado" className="input" />
        </div>
        <div>
          <label className="label" htmlFor={`anio-${id}`}>Año</label>
          <input id={`anio-${id}`} name="anio" inputMode="numeric" defaultValue={moto?.anio ?? ""} placeholder="2021" className="input" />
        </div>
        <div>
          <label className="label" htmlFor={`km-${id}`}>Km al empezar a registrar</label>
          <input id={`km-${id}`} name="km_iniciales" inputMode="numeric" defaultValue={moto?.km_iniciales || ""} placeholder="0" className="input" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {estado?.error && (
          <p role="alert" className="mr-auto flex items-center gap-1.5 text-sm text-red-400">
            <CircleAlert className="size-4 shrink-0" /> {estado.error}
          </p>
        )}
        {estado?.ok && (
          <p className="mr-auto flex items-center gap-1.5 text-sm text-green-400">
            <Check className="size-4" /> {estado.ok}
          </p>
        )}
        <Boton pending={pendiente} editando={!!moto} />
      </div>
    </form>
  );
}
