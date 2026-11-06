import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, CalendarDays, Images, Map as MapIcon, Motorbike, Play, Route, Tag, TrendingUp } from "lucide-react";
import { getViajeCompartido } from "@/lib/queries";
import { cldMiniatura, cldSrcSet } from "@/lib/cld";
import { dias, km, num, rangoFechas } from "@/lib/format";
import { Galeria } from "@/components/Galeria";
import { MapaRutaLazy } from "@/components/mapas";
import Altimetria from "@/components/Altimetria";
import { LugaresRecorrido } from "@/components/LugaresRecorrido";

// Vista pública de solo lectura de un viaje compartido. Sin login.
// Sin notas, diario, gastos ni odómetro (getViajeCompartido los quita).

type Props = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const v = await getViajeCompartido((await params).token);
  if (!v) return { title: "Viaje no disponible" };
  const portada = v.fotos[0];
  return {
    title: `${v.titulo} · ${km(v.km)}`,
    description: `Viaje en moto: ${[v.origen, v.destino].filter(Boolean).join(" → ") || v.titulo} · ${rangoFechas(v.fecha_inicio, v.fecha_fin)}`,
    robots: { index: false, follow: false },
    openGraph: portada ? { images: [cldMiniatura(portada, { w: 1200, h: 630, crop: "fill", dpr: false })] } : undefined,
  };
}

export default async function ViajeCompartido({ params }: Props) {
  const { token } = await params;
  const v = await getViajeCompartido(token);
  if (!v) notFound();

  const portada = v.fotos[0];
  const d = dias(v.fecha_inicio, v.fecha_fin);
  const fotosGps = v.fotos
    .filter((f) => f.lat != null && f.lng != null)
    .map((f) => ({ id: f.id, public_id: f.public_id, tipo: f.tipo, lat: f.lat!, lng: f.lng!, caption: f.caption }));

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-5 pb-16 md:py-10">
      <header className="relative -mx-4 overflow-hidden md:mx-0 md:rounded-3xl">
        {portada ? (
          <img
            src={cldMiniatura(portada, { w: 1600, h: 800, crop: "fill" })}
            srcSet={portada.tipo === "video" ? undefined : cldSrcSet(portada.public_id, [800, 1200, 1600, 2400])}
            sizes="(min-width: 1024px) 1024px, 100vw"
            alt={v.titulo}
            className="aspect-[4/3] w-full object-cover sm:aspect-[2/1]"
          />
        ) : (
          <div className="aspect-[3/1] w-full bg-gradient-to-br from-grafito to-carbon" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-asfalto via-asfalto/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 space-y-2 p-5 md:p-8">
          <p className="flex items-center gap-2 text-sm text-white/80">
            <CalendarDays className="size-4" /> {rangoFechas(v.fecha_inicio, v.fecha_fin)}
          </p>
          <h1 className="font-display text-4xl leading-none font-bold uppercase md:text-6xl">{v.titulo}</h1>
          {(v.origen || v.destino) && (
            <p className="flex flex-wrap items-center gap-2 text-white/80">
              {v.origen && <span>{v.origen}</span>}
              {v.origen && v.destino && <ArrowRight className="size-4" />}
              {v.destino && <span>{v.destino}</span>}
            </p>
          )}
          {v.etiquetas?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {v.etiquetas.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-0.5 text-xs text-white/90">
                  <Tag className="size-3" /> {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Dato icono={<Route className="size-3.5" />} label="Recorrido" valor={km(v.km)} />
        <Dato icono={<CalendarDays className="size-3.5" />} label={d === 1 ? "Día" : "Días"} valor={num(d)} />
        <Dato icono={<TrendingUp className="size-3.5" />} label="Promedio por día" valor={km(Math.round(v.km / d))} />
        <Dato icono={<Motorbike className="size-3.5" />} label="Moto" valor={v.motos?.nombre ?? "—"} />
      </section>

      {(v.gpx_url || v.ruta || fotosGps.length > 0) && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-3xl font-bold uppercase">
              <MapIcon className="size-6 text-naranja" /> Recorrido
            </h2>
            {(v.gpx_url || v.ruta) && (
              <Link href={`/c/${token}/recorrido`} className="btn-primary py-2">
                <Play className="size-4" /> Ver animado
              </Link>
            )}
          </div>
          <div className="h-80 overflow-hidden rounded-2xl border border-linea md:h-[28rem]">
            <MapaRutaLazy
              url={v.gpx_url}
              ruta={v.ruta}
              fotos={fotosGps}
              marcadores={(v.lugares ?? []).slice(1, -1).map((x) => ({ lat: x.lat, lng: x.lng, nombre: x.nombre, color: "#e5e7eb", radio: 4 }))}
            />
          </div>
          {v.altimetria && (
            <div className="card p-4 md:p-5">
              <Altimetria inicial={v.altimetria} soloLectura />
            </div>
          )}
        </section>
      )}

      {v.lugares && v.lugares.length > 0 && (
        <LugaresRecorrido viajeId={v.id} lugares={v.lugares} gpxUrl={v.gpx_url} ruta={v.ruta} />
      )}

      {v.fotos.length > 0 && (
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 font-display text-3xl font-bold uppercase">
            <Images className="size-6 text-naranja" /> Fotos <span className="text-niebla">· {v.fotos.length}</span>
          </h2>
          <Galeria fotos={v.fotos} titulo={v.titulo} agrupar="dia" fechaInicio={v.fecha_inicio} soloLectura />
        </section>
      )}

      <footer className="flex items-center justify-center gap-2 border-t border-linea pt-6 text-sm text-niebla">
        <Motorbike className="size-4 text-naranja" /> Mis viajes en moto
      </footer>
    </main>
  );
}

function Dato({ icono, label, valor }: { icono: React.ReactNode; label: string; valor: string }) {
  return (
    <div className="card p-4">
      <p className="flex items-center gap-1.5 text-xs text-niebla">
        {icono} {label}
      </p>
      <p className="font-display text-2xl font-bold">{valor}</p>
    </div>
  );
}
