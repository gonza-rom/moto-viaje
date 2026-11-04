"use client";

import Link from "next/link";
import { useEffect } from "react";
import { House, RotateCw, TriangleAlert } from "lucide-react";

export default function ErrorApp({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const sinRed = typeof navigator !== "undefined" && !navigator.onLine;

  return (
    <div className="card mx-auto max-w-lg space-y-4 p-8 text-center">
      <TriangleAlert className="mx-auto size-10 text-naranja" strokeWidth={1.5} />
      <h1 className="font-display text-3xl font-bold uppercase">{sinRed ? "Sin señal" : "Algo salió mal"}</h1>
      <p className="text-sm text-niebla">
        {sinRed
          ? "No hay conexión a internet. Probá de nuevo cuando tengas señal."
          : "No se pudo cargar esta página. Si se repite, revisá que la base de datos esté bien configurada."}
      </p>
      {error.digest && <p className="font-mono text-xs text-niebla/60">Código: {error.digest}</p>}
      <div className="flex justify-center gap-2">
        <Link href="/" className="btn-ghost">
          <House className="size-4" /> Inicio
        </Link>
        <button onClick={reset} className="btn-primary">
          <RotateCw className="size-4" /> Reintentar
        </button>
      </div>
    </div>
  );
}
