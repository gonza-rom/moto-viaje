"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { borrarPlan } from "@/app/acciones-extra";

export function BorrarPlan({ id, nombre }: { id: string; nombre: string }) {
  const [pendiente, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() => {
        if (!confirm(`¿Borrar el plan "${nombre}"? El viaje que hiciste con él no se borra.`)) return;
        start(async () => {
          await borrarPlan(id);
          window.location.href = "/planificar";
        });
      }}
      className="absolute top-2.5 right-2.5 grid size-7 place-items-center rounded-md text-niebla hover:text-red-400 disabled:opacity-40"
      title="Borrar plan"
    >
      <Trash2 className="size-4" />
    </button>
  );
}
