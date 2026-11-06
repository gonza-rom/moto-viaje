import Link from "next/link";
import { getGastos, getMantenimientos, getMotos, getViajes } from "@/lib/queries";
import { estadosMantenimiento, odometroActual, textoFalta } from "@/lib/mantenimiento";
import { TriangleAlert } from "lucide-react";
import { ViajeCard } from "@/components/ViajeCard";
import { dias, km, num, rangoFechas } from "@/lib/format";
import { MapaViajesLazy } from "@/components/mapas";
import { cldMiniatura } from "@/lib/cld";
import type { ViajeEnMapa } from "@/components/MapaViajes";
import {
  ArrowRight,
  CalendarDays,
  Camera,
  ChartColumn,
  Globe,
  Heart,
  Map as MapIcon,
  Motorbike,
  Plus,
  Route,
  Trophy,
  Fuel,
  type LucideIcon,
} from "lucide-react";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default async function Dashboard() {
  const [viajes, motos, gastos, mants] = await Promise.all([
    getViajes(),
    getMotos(),
    getGastos().catch(() => []),
    getMantenimientos().catch(() => []),
  ]);

  // Avisos de mantenimiento (vencidos o próximos) de todas las motos
  const avisos = motos.flatMap((m) =>
    estadosMantenimiento(
      mants.filter((x) => x.moto_id === m.id),
      odometroActual(m, viajes, gastos, mants)
    )
      .filter((e) => e.estado === "vencido" || e.estado === "pronto")
      .map((e) => ({ ...e, moto: m.nombre }))
  );

  const total = viajes.reduce((a, v) => a + v.km, 0);
  const anioActual = new Date().getFullYear();
  const esteAnio = viajes
    .filter((v) => v.fecha_inicio.startsWith(String(anioActual)))
    .reduce((a, v) => a + v.km, 0);
  const diasRuta = viajes.reduce((a, v) => a + dias(v.fecha_inicio, v.fecha_fin), 0);
  const fotos = viajes.reduce((a, v) => a + v.fotos.filter((f) => f.tipo !== "video").length, 0);
  const videos = viajes.reduce((a, v) => a + v.fotos.filter((f) => f.tipo === "video").length, 0);
  const masLargo = viajes.reduce<(typeof viajes)[number] | null>((m, v) => (!m || v.km > m.km ? v : m), null);

  // Últimos 12 meses
  const hoy = new Date();
  const meses = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - 11 + i, 1);
    return { clave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: MESES[d.getMonth()], km: 0 };
  });
  for (const v of viajes) {
    const m = meses.find((x) => x.clave === v.fecha_inicio.slice(0, 7));
    if (m) m.km += v.km;
  }
  const maxMes = Math.max(1, ...meses.map((m) => m.km));

  // Recorridos para el mapa general (trazos reducidos para no mandar de más al cliente)
  const enMapa: ViajeEnMapa[] = viajes
    .filter((v) => v.ruta?.trazo?.length || v.gpx_url)
    .map((v) => {
      const t = v.ruta?.trazo;
      const paso = t ? Math.max(1, Math.ceil(t.length / 400)) : 1;
      return {
        id: v.id,
        titulo: v.titulo,
        km: km(v.km),
        fechas: rangoFechas(v.fecha_inicio, v.fecha_fin),
        trazo: t && t.length > 1 ? t.filter((_, i) => i % paso === 0 || i === t.length - 1) : null,
        gpx_url: v.gpx_url,
      };
    });

  // Favoritas de todos los viajes (máx. 12, de los viajes más nuevos)
  const favoritas = viajes
    .flatMap((v) => v.fotos.filter((f) => f.favorita).map((f) => ({ ...f, titulo: v.titulo })))
    .slice(0, 12);

  const porMoto = motos
    .map((m) => ({ ...m, km: viajes.filter((v) => v.moto_id === m.id).reduce((a, v) => a + v.km, 0) }))
    .sort((a, b) => b.km - a.km);

  if (!viajes.length) {
    return (
      <div className="card mx-auto max-w-lg space-y-4 p-10 text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-naranja text-black">
          <Motorbike className="size-9" />
        </div>
        <h1 className="font-display text-4xl font-bold uppercase">Primer viaje</h1>
        <p className="text-niebla">Cargá tu primer viaje con fotos, kilómetros y la ruta.</p>
        <div className="flex justify-center gap-2">
          {!motos.length && (
            <Link href="/motos" className="btn-ghost">
              <Motorbike className="size-4" /> Agregar moto
            </Link>
          )}
          <Link href="/viajes/nuevo" className="btn-primary">
            <Plus className="size-4" /> Nuevo viaje
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {avisos.length > 0 && (
        <Link href="/motos" className="block space-y-1.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 hover:bg-amber-500/15">
          {avisos.slice(0, 4).map((a) => (
            <p key={a.moto + a.tipo} className={`flex items-center gap-2 text-sm ${a.estado === "vencido" ? "text-red-300" : "text-amber-200"}`}>
              <TriangleAlert className="size-4 shrink-0" />
              <span>
                <b>{a.label}</b>{motos.length > 1 && ` (${a.moto})`}: {textoFalta(a)}
              </span>
            </p>
          ))}
        </Link>
      )}

      {/* Hero km totales */}
      <section className="card relative overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-naranja/15 blur-3xl" />
        <p className="label">Kilómetros totales</p>
        <p className="font-display text-6xl leading-none font-bold tracking-tight md:text-8xl">
          {num(total)}
          <span className="ml-2 text-2xl text-niebla md:text-3xl">km</span>
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-niebla">
          <Globe className="size-4" />
          {total >= 40075
            ? `${num(Math.floor((total / 40075) * 10) / 10)} vueltas a la Tierra`
            : `${num(Math.round((total / 40075) * 1000) / 10)}% de una vuelta a la Tierra`}
        </p>
        <div className="absolute top-5 right-5 flex gap-2 md:top-7 md:right-7">
          <Link href="/planificar" className="inline-flex items-center gap-1.5 rounded-full border border-linea bg-asfalto/60 px-3 py-1.5 text-xs font-semibold text-niebla hover:text-white">
            <Fuel className="size-3.5" /> Planificar
          </Link>
          <Link href="/estadisticas" className="inline-flex items-center gap-1.5 rounded-full border border-linea bg-asfalto/60 px-3 py-1.5 text-xs font-semibold text-niebla hover:text-white">
            <Trophy className="size-3.5" /> Estadísticas
          </Link>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat icono={ChartColumn} label={`En ${anioActual}`} valor={km(esteAnio)} />
          <Stat icono={Route} label="Viajes" valor={num(viajes.length)} />
          <Stat icono={CalendarDays} label="Días en ruta" valor={num(diasRuta)} />
          <Stat icono={Camera} label={videos ? "Fotos · videos" : "Fotos"} valor={videos ? `${num(fotos)} · ${num(videos)}` : num(fotos)} />
        </div>
      </section>

      {enMapa.length > 0 && (
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 font-display text-3xl font-bold uppercase">
            <MapIcon className="size-6 text-naranja" /> Mapa de mis rutas
          </h2>
          <div className="h-80 overflow-hidden rounded-2xl border border-linea md:h-[26rem]">
            <MapaViajesLazy viajes={enMapa} />
          </div>
        </section>
      )}

      {favoritas.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <h2 className="flex items-center gap-2 font-display text-3xl font-bold uppercase">
              <Heart className="size-6 text-naranja" /> Favoritas
            </h2>
            <Link href="/fotos" className="flex items-center gap-1 text-sm text-niebla hover:text-white">
              Todas las fotos <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
            {favoritas.map((f) => (
              <Link
                key={f.id}
                href={`/viajes/${f.viaje_id}`}
                className="group relative w-40 shrink-0 snap-start overflow-hidden rounded-xl bg-grafito md:w-48"
              >
                <img
                  src={cldMiniatura(f, { w: 400, h: 500, crop: "fill" })}
                  alt={f.caption || f.titulo}
                  loading="lazy"
                  className="aspect-[4/5] w-full object-cover transition duration-500 group-hover:scale-105"
                />
                <span className="absolute inset-x-0 bottom-0 line-clamp-1 bg-gradient-to-t from-black/85 to-transparent px-2.5 pt-8 pb-2 text-xs text-white">
                  {f.caption || f.titulo}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Km por mes */}
        <section className="card p-6 lg:col-span-2">
          <h2 className="label flex items-center gap-1.5">
            <ChartColumn className="size-3.5" /> Km por mes · últimos 12
          </h2>
          <div className="mt-4 flex h-44 items-end gap-1.5">
            {meses.map((m) => (
              <div key={m.clave} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="text-[10px] text-niebla opacity-0 transition group-hover:opacity-100">
                  {m.km ? num(m.km) : ""}
                </span>
                <div
                  className={`w-full rounded-t-md ${m.km ? "bg-naranja" : "bg-grafito"}`}
                  style={{ height: `${Math.max(3, (m.km / maxMes) * 100)}%` }}
                  title={`${m.label}: ${km(m.km)}`}
                />
                <span className="text-[10px] text-niebla">{m.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Destacados */}
        <section className="card space-y-5 p-6">
          {masLargo && (
            <div>
              <h2 className="label flex items-center gap-1.5">
                <Trophy className="size-3.5" /> Viaje más largo
              </h2>
              <Link href={`/viajes/${masLargo.id}`} className="group block">
                <p className="font-display text-3xl font-bold">{km(masLargo.km)}</p>
                <p className="text-sm text-niebla group-hover:text-white">{masLargo.titulo}</p>
              </Link>
            </div>
          )}
          {porMoto.length > 0 && (
            <div>
              <h2 className="label flex items-center gap-1.5">
                <Motorbike className="size-3.5" /> Por moto
              </h2>
              <ul className="space-y-2.5">
                {porMoto.map((m) => (
                  <li key={m.id}>
                    <div className="flex justify-between text-sm">
                      <span>{m.nombre}</span>
                      <span className="text-niebla">{km(m.km)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-grafito">
                      <div className="h-full bg-naranja" style={{ width: `${total ? (m.km / total) * 100 : 0}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* Últimos viajes */}
      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-3xl font-bold uppercase">Últimos viajes</h2>
          <Link href="/viajes" className="flex items-center gap-1 text-sm text-niebla hover:text-white">
            Ver todos <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {viajes.slice(0, 6).map((v) => (
            <ViajeCard key={v.id} v={v} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ icono: Icono, label, valor }: { icono: LucideIcon; label: string; valor: string }) {
  return (
    <div className="rounded-xl bg-grafito/60 p-4">
      <p className="flex items-center gap-1.5 text-xs text-niebla">
        <Icono className="size-3.5" /> {label}
      </p>
      <p className="font-display text-2xl font-bold">{valor}</p>
    </div>
  );
}
