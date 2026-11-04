"use client";

import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Registra el service worker (solo en producción) */
export function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // Páginas que tienen que abrir sin señal (sobre todo para cargar un viaje en la ruta)
        if (location.pathname !== "/login" && !location.pathname.startsWith("/c/")) {
          reg.active?.postMessage({ tipo: "precachear", urls: ["/", "/viajes/nuevo", "/viajes", "/motos", "/fotos"] });
        }
      })
      .catch(() => {});
  }, []);
  return null;
}

const esStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Botón "Instalar app": prompt nativo en Android/Chrome, instrucciones en iPhone */
export function InstalarApp() {
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [ayuda, setAyuda] = useState(false);

  useEffect(() => {
    if (esStandalone()) return;
    const ua = navigator.userAgent;
    setIos(/iphone|ipad|ipod/i.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvento(e as BeforeInstallPromptEvent);
    };
    const onInstalada = () => setEvento(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalada);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalada);
    };
  }, []);

  if (!evento && !ios) return null;

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          if (evento) {
            await evento.prompt();
            await evento.userChoice;
            setEvento(null);
          } else setAyuda(true);
        }}
        className="btn-ghost px-3 py-2"
        title="Instalar app"
      >
        <Download className="size-4" />
        <span className="hidden sm:inline">Instalar</span>
      </button>

      {ayuda && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-4 sm:items-center sm:justify-center" onClick={() => setAyuda(false)}>
          <div
            className="card w-full max-w-sm space-y-4 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold uppercase">Instalar en iPhone</h2>
              <button type="button" onClick={() => setAyuda(false)} className="text-niebla" title="Cerrar">
                <X className="size-5" />
              </button>
            </div>
            <ol className="space-y-3 text-sm">
              <li className="flex items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-grafito"><Share className="size-4" /></span>
                Tocá <b>Compartir</b> en la barra de Safari
              </li>
              <li className="flex items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-grafito"><SquarePlus className="size-4" /></span>
                Elegí <b>Agregar a inicio</b>
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
