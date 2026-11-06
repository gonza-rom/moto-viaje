"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, ImageUp, Link2Off, LoaderCircle, Share2 } from "lucide-react";
import { albumViaje } from "@/app/acciones-extra";

/** Link para que acompañantes suban sus fotos al viaje sin la contraseña */
export function AlbumCompartido({ viajeId, titulo, token: inicial }: { viajeId: string; titulo: string; token: string | null }) {
  const [token, setToken] = useState(inicial);
  const [copiado, setCopiado] = useState(false);
  const [pending, start] = useTransition();
  const [origen, setOrigen] = useState("");
  const [puedeShare, setPuedeShare] = useState(false);
  useEffect(() => {
    setOrigen(window.location.origin);
    setPuedeShare("share" in navigator);
  }, []);
  const url = token ? `${origen}/album/${token}` : null;

  const cambiar = (activar: boolean) =>
    start(async () => {
      const r = await albumViaje(viajeId, activar);
      if (r.error) alert(r.error);
      else setToken(r.token);
    });

  async function compartir() {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: titulo, text: `Subí tus fotos del viaje "${titulo}" acá:`, url });
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
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <ImageUp className="size-4" />} Link para que suban fotos
        </button>
        <p className="text-xs text-niebla">Para tu acompañante: sube sus fotos al viaje sin tu contraseña. No puede ver ni borrar nada.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-niebla">Álbum compartido (suben fotos)</p>
      <div className="flex flex-wrap gap-2">
        <input readOnly value={url ?? ""} onFocus={(e) => e.target.select()} className="input min-w-0 flex-1 font-mono text-xs sm:text-xs" />
        <button type="button" onClick={compartir} className="btn-primary">
          {copiado ? <Check className="size-4" /> : puedeShare ? <Share2 className="size-4" /> : <Copy className="size-4" />}
          {copiado ? "Copiado" : "Enviar"}
        </button>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => confirm("¿Desactivar el álbum? Ya no van a poder subir fotos con ese link (las que subieron quedan).") && cambiar(false)}
        className="flex items-center gap-1.5 text-xs text-red-400 hover:underline"
      >
        <Link2Off className="size-3.5" /> Desactivar álbum
      </button>
    </div>
  );
}
