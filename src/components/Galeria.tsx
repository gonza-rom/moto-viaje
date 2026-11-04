"use client";

import { useCallback, useEffect, useState } from "react";
import { cldMiniatura, cldOriginal, cldPoster, cldSrcSet, cldUrl, cldVideo, duracionTxt } from "@/lib/cld";
import { ChevronLeft, ChevronRight, Download, Play, X } from "lucide-react";
import type { Foto } from "@/lib/types";

export function Galeria({ fotos, titulo }: { fotos: Foto[]; titulo: string }) {
  const [abierta, setAbierta] = useState<number | null>(null);

  const cerrar = useCallback(() => setAbierta(null), []);
  const mover = useCallback(
    (d: number) => setAbierta((i) => (i === null ? i : (i + d + fotos.length) % fotos.length)),
    [fotos.length]
  );

  useEffect(() => {
    if (abierta === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
      if (e.key === "ArrowRight") mover(1);
      if (e.key === "ArrowLeft") mover(-1);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [abierta, cerrar, mover]);

  // Swipe en mobile
  const [touchX, setTouchX] = useState<number | null>(null);

  if (!fotos.length) return null;
  const actual = abierta !== null ? fotos[abierta] : null;

  return (
    <>
      <div className="columns-2 gap-2 sm:columns-3 lg:columns-4">
        {fotos.map((f, i) => (
          <button
            key={f.id}
            onClick={() => setAbierta(i)}
            className="relative mb-2 block w-full overflow-hidden rounded-xl bg-grafito focus:ring-2 focus:ring-naranja focus:outline-none"
          >
            {f.tipo === "video" && (
              <span className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className="grid size-12 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm">
                  <Play className="ml-0.5 size-5 fill-current" />
                </span>
                {f.duracion && (
                  <span className="absolute right-2 bottom-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white">
                    {duracionTxt(f.duracion)}
                  </span>
                )}
              </span>
            )}
            <img
              src={cldMiniatura(f, { w: 600 })}
              alt={f.caption || titulo}
              width={f.width ?? undefined}
              height={f.height ?? undefined}
              loading="lazy"
              className="h-auto w-full transition duration-300 hover:opacity-85"
            />
          </button>
        ))}
      </div>

      {actual && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/95"
          onClick={cerrar}
          onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX === null) return;
            const dx = e.changedTouches[0].clientX - touchX;
            if (Math.abs(dx) > 50) mover(dx < 0 ? 1 : -1);
            setTouchX(null);
          }}
        >
          <div className="flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] text-sm text-niebla">
            <span>
              {abierta! + 1} / {fotos.length}
            </span>
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <a
                href={cldOriginal(actual)}
                className="btn-ghost px-3 py-1.5"
              >
                <Download className="size-4" />
                <span className="hidden sm:inline">Descargar original</span>
              </a>
              <button onClick={cerrar} className="btn-ghost px-3 py-1.5" title="Cerrar">
                <X className="size-4" />
              </button>
            </div>
          </div>

          <div className="relative flex flex-1 items-center justify-center px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {actual.tipo === "video" ? (
              <video
                key={actual.id}
                src={cldVideo(actual.public_id)}
                poster={cldPoster(actual.public_id, { w: 1280 })}
                controls
                autoPlay
                playsInline
                className="max-h-[calc(100dvh-140px)] max-w-full rounded-lg bg-black"
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
              />
            ) : (
              <img
                key={actual.id}
                src={cldUrl(actual.public_id, { w: 1600 })}
                srcSet={cldSrcSet(actual.public_id)}
                sizes="100vw"
                alt={actual.caption || titulo}
                className="max-h-[calc(100dvh-140px)] max-w-full rounded-lg object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            )}
            {fotos.length > 1 && (
              <>
                <button
                  onClick={(e) => (e.stopPropagation(), mover(-1))}
                  className="absolute left-3 hidden size-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:grid"
                >
                  <ChevronLeft className="size-6" />
                </button>
                <button
                  onClick={(e) => (e.stopPropagation(), mover(1))}
                  className="absolute right-3 hidden size-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:grid"
                >
                  <ChevronRight className="size-6" />
                </button>
              </>
            )}
          </div>
          {actual.caption && <p className="px-4 pb-6 text-center text-sm text-white/80">{actual.caption}</p>}
        </div>
      )}
    </>
  );
}
