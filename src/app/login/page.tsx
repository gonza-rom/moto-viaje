"use client";

import { useActionState } from "react";
import { LoaderCircle, LogIn, Motorbike } from "lucide-react";
import { login } from "../actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <form action={action} className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-naranja text-black">
            <Motorbike className="size-8" />
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight uppercase">Mis viajes</h1>
          <p className="text-sm text-niebla">Bitácora privada</p>
        </div>

        <div>
          <label htmlFor="password" className="label">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            className="input"
          />
          {state?.error && <p className="mt-2 text-sm text-red-400">{state.error}</p>}
        </div>

        <button disabled={pending} className="btn-primary w-full">
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <LogIn className="size-4" />}
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
