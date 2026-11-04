"use client";

import { useTransition } from "react";
import { LoaderCircle } from "lucide-react";

export function ConfirmButton({
  action,
  mensaje,
  children,
  className = "btn-ghost text-red-400 hover:border-red-400/60",
  recargar = false,
}: {
  action: () => Promise<void>;
  mensaje: string;
  children: React.ReactNode;
  className?: string;
  /** Recargar la página al terminar (cuando la action no redirige) */
  recargar?: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={() => {
        if (!window.confirm(mensaje)) return;
        start(async () => {
          await action();
          if (recargar) window.location.reload();
        });
      }}
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" /> : children}
    </button>
  );
}
