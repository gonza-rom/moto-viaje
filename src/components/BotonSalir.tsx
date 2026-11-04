"use client";

import { LogOut } from "lucide-react";

/** Cerrar sesión y borrar del celular las páginas guardadas para usar sin señal (tienen datos privados) */
export function BotonSalir({ logout }: { logout: () => Promise<void> }) {
  return (
    <form
      action={logout}
      onSubmit={() => {
        navigator.serviceWorker?.controller?.postMessage("cerrar-sesion");
        caches?.delete("paginas").catch(() => {});
      }}
    >
      <button className="btn-ghost px-3 py-2" title="Salir">
        <LogOut className="size-4" />
        <span className="hidden sm:inline">Salir</span>
      </button>
    </form>
  );
}
