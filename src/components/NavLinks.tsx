"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, ChartColumn, Images, LayoutDashboard, Motorbike, Plus, Route, type LucideIcon } from "lucide-react";

const LINKS: { href: string; label: string; icon: LucideIcon; mobileOnly?: boolean; desktopOnly?: boolean }[] = [
  { href: "/", label: "Inicio", icon: LayoutDashboard },
  { href: "/viajes", label: "Viajes", icon: Route },
  { href: "/viajes/nuevo", label: "Nuevo", icon: Plus, mobileOnly: true },
  { href: "/jornadas", label: "Trabajo", icon: BriefcaseBusiness },
  { href: "/fotos", label: "Fotos", icon: Images },
  { href: "/motos", label: "Motos", icon: Motorbike },
  // En el celular se llega desde el inicio (el menú de abajo ya tiene 6)
  { href: "/estadisticas", label: "Estadísticas", icon: ChartColumn, desktopOnly: true },
];

export function NavLinks({ mobile = false }: { mobile?: boolean }) {
  const path = usePathname();
  const activo = (href: string) =>
    href === "/"
      ? path === "/"
      : href === "/viajes"
        ? path === "/viajes" || /^\/viajes\/(?!nuevo)/.test(path)
        : path.startsWith(href);

  if (mobile) {
    return (
      <ul className="grid grid-cols-6 pb-[env(safe-area-inset-bottom)]">
        {LINKS.filter((l) => !l.desktopOnly).map(({ href, label, icon: Icono, mobileOnly }) => (
          <li key={href}>
            <Link
              href={href}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
                activo(href) ? "text-naranja" : "text-niebla"
              }`}
            >
              {mobileOnly ? (
                <span className="-mt-1 grid size-8 place-items-center rounded-full bg-naranja text-black">
                  <Icono className="size-5" />
                </span>
              ) : (
                <Icono className="size-5" />
              )}
              {label}
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="flex items-center gap-1">
      {LINKS.filter((l) => !l.mobileOnly).map(({ href, label, icon: Icono }) => (
        <li key={href}>
          <Link
            href={href}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              activo(href) ? "bg-grafito text-white" : "text-niebla hover:text-white"
            }`}
          >
            <Icono className="size-4" />
            {label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
