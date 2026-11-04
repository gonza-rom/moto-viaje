"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, Link2, Link2Off, LoaderCircle, Share2 } from "lucide-react";
import { compartirViaje } from "@/app/acciones-extra";

export function CompartirViaje({ viajeId, titulo, token: inicial }: { viajeId: string; titulo: string; token: string | null }) {
  const [token, setToken] = useState(inicial);
  const [copiado, setCopiado] = useState(false);
  const [pending, start] = useTransition();
  // origin y navigator.share solo existen en el navegador: se leen después de montar (sin desajuste de hidratación)
  const [origen, setOrigen] = useState("");
  const [puedeShare, setPuedeShare] = useState(false);
  useEffect(() => {
    setOrigen(window.location.origin);
    setPuedeShare("share" in navigator);
  }, []);
  const url = token ? `${origen}/c/${token}` : null;

  const cambiar = (activar: boolean) =>
    start(async () => {
      const r = await compartirViaje(viajeId, activar);
      if (r.error) alert(r.error);
      else setToken(r.token);
    });

  async function compartir() {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: titulo, text: `Mirá mi viaje en moto: ${titulo}`, url });
        return;
      } catch {
        /* cancelado: copiar */
      }
    }
    await navigator.clipboard.writeText(url);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  if (!token) {
    return (
      <div className="space-y-2">
        <button type="button" disabled={pending} onClick={() => cambiar(true)} className="btn-ghost">
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Link2 className="size-4" />} Crear link para compartir
        </button>
        <p className="text-xs text-niebla">
          Quien tenga el link ve el recorrido, los km y las fotos. No ve tus notas, el diario, los gastos ni el odómetro.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input readOnly value={url ?? ""} onFocus={(e) => e.target.select()} className="input min-w-0 flex-1 font-mono text-xs sm:text-xs" />
        <button type="button" onClick={compartir} className="btn-primary">
          {copiado ? <Check className="size-4" /> : puedeShare ? <Share2 className="size-4" /> : <Copy className="size-4" />}
          {copiado ? "Copiado" : "Compartir"}
        </button>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => confirm("¿Desactivar el link? Quien lo tenga ya no va a poder ver el viaje.") && cambiar(false)}
        className="flex items-center gap-1.5 text-xs text-red-400 hover:underline"
      >
        <Link2Off className="size-3.5" /> Desactivar link
      </button>
    </div>
  );
}
