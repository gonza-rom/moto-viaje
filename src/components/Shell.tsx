import Link from "next/link";
import { logout } from "@/app/actions";
import { LogOut, Motorbike, Plus } from "lucide-react";
import { NavLinks } from "./NavLinks";
import { InstalarApp } from "./Pwa";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-10">
      <header className="sticky top-0 z-30 border-b border-linea/70 bg-asfalto/85 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] md:gap-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-naranja text-black">
              <Motorbike className="size-5" />
            </span>
            <span className="font-display text-xl font-bold tracking-wide whitespace-nowrap uppercase">Mis viajes</span>
          </Link>
          <div className="hidden md:block">
            <NavLinks />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <InstalarApp />
            <Link href="/viajes/nuevo" className="btn-primary hidden py-2 sm:inline-flex">
              <Plus className="size-4" /> Nuevo viaje
            </Link>
            <form action={logout}>
              <button className="btn-ghost px-3 py-2" title="Salir">
                <LogOut className="size-4" />
                <span className="hidden sm:inline">Salir</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] md:py-10">{children}</main>

      {/* Nav inferior en mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-linea bg-carbon/95 backdrop-blur md:hidden">
        <NavLinks mobile />
      </nav>
    </div>
  );
}
