"use client";

import { useTransition } from "react";
import { LoaderCircle } from "lucide-react";

export function ConfirmButton({
  action,
  mensaje,
  children,
  className = "btn-ghost text-red-400 hover:border-red-400/60",
}: {
  action: () => Promise<void>;
  mensaje: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={() => {
        if (window.confirm(mensaje)) start(() => action());
      }}
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" /> : children}
    </button>
  );
}
