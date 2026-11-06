"use client";

import { useEffect, useState } from "react";
import { Download, ImageIcon, LoaderCircle, Share2, X } from "lucide-react";

/**
 * Tarjeta (imagen) de un viaje o de un año: vista previa, compartir directo (WhatsApp, Instagram…) o descargar.
 * variantes: opciones para elegir (p. ej. el año); base: URL de la imagen sin parámetros.
 */
export function BotonTarjeta({
  viajeId,
  titulo,
  etiqueta = "Tarjeta para redes",
  variantes,
}: {
  viajeId?: string;
  titulo: string;
  etiqueta?: string;
  variantes?: { label: string; base: string }[];
}) {
  const [variante, setVariante] = useState(0);
  const base = variantes?.[variante]?.base ?? `/api/tarjeta/${viajeId}`;
  const [abierta, setAbierta] = useState(false);
  const [formato, setFormato] = useState<"cuadrado" | "og">("cuadrado");
  const [cargando, setCargando] = useState(true);
  const [compartiendo, setCompartiendo] = useState(false);
  const [puedeCompartir, setPuedeCompartir] = useState(false);
  const url = `${base}?formato=${formato}`;

  useEffect(() => {
    try {
      const prueba = new File([new Blob()], "x.png", { type: "image/png" });
      setPuedeCompartir(!!navigator.canShare?.({ files: [prueba] }));
    } catch {
      setPuedeCompartir(false);
    }
  }, []);

  useEffect(() => {
    if (!abierta) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAbierta(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierta]);

  async function compartir() {
    setCompartiendo(true);
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], "viaje.png", { type: "image/png" });
      await navigator.share({ files: [file], title: titulo });
    } catch (e) {
      if ((e as Error).name !== "AbortError") alert("No se pudo compartir. Probá con Descargar.");
    } finally {
      setCompartiendo(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => (setAbierta(true), setCargando(true))} className="btn-ghost">
        <ImageIcon className="size-4" /> {etiqueta}
      </button>

      {abierta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setAbierta(false)}>
          <div className="card w-full max-w-md space-y-3 p-4" onClick={(e) => e.stopPropagation()}>
            {variantes && variantes.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {variantes.map((v, i) => (
                  <button
                    key={v.base}
                    type="button"
                    onClick={() => (setVariante(i), setCargando(true))}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${i === variante ? "border-naranja bg-naranja text-black" : "border-linea text-niebla"}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-full border border-linea text-xs">
                {(
                  [
                    ["cuadrado", "Cuadrada (Instagram)"],
                    ["og", "Horizontal"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => (setFormato(k), setCargando(true))}
                    className={`px-3 py-1.5 font-semibold ${formato === k ? "bg-white/10 text-white" : "text-niebla"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setAbierta(false)} className="btn-ghost ml-auto px-2.5 py-1.5" title="Cerrar">
                <X className="size-4" />
              </button>
            </div>

            <div className={`relative overflow-hidden rounded-xl bg-grafito ${formato === "cuadrado" ? "aspect-square" : "aspect-[1200/630]"}`}>
              {cargando && (
                <span className="absolute inset-0 grid place-items-center text-sm text-niebla">
                  <LoaderCircle className="size-6 animate-spin text-naranja" />
                </span>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={url} src={url} alt="Tarjeta del viaje" onLoad={() => setCargando(false)} className="size-full object-cover" />
            </div>

            <div className="flex gap-2">
              {puedeCompartir && (
                <button type="button" onClick={compartir} disabled={compartiendo} className="btn-primary flex-1 disabled:opacity-50">
                  <Share2 className="size-4" /> {compartiendo ? "Preparando…" : "Compartir"}
                </button>
              )}
              <a href={`${url}&descargar=1`} download className={puedeCompartir ? "btn-ghost" : "btn-primary flex-1"}>
                <Download className="size-4" /> Descargar
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
