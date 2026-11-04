import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ExternalLink,
  Gauge,
  Images,
  Map as MapIcon,
  Milestone,
  Motorbike,
  NotebookPen,
  Pencil,
  Route,
  Trash2,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { getViaje } from "@/lib/queries";
import { cldMiniatura, cldSrcSet } from "@/lib/cld";
import { dias, km, num, rangoFechas } from "@/lib/format";
import { linkGoogleMaps } from "@/lib/ruta";
import { Galeria } from "@/components/Galeria";
import { ConfirmButton } from "@/components/ConfirmButton";
import { MapaRutaLazy } from "@/components/mapas";
import { eliminarViaje } from "@/app/actions";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const v = await getViaje((await params).id);
  return { title: v?.titulo ?? "Viaje" };
}

export default async function ViajePage({ params }: Props) {
  const { id } = await params;
  const v = await getViaje(id);
  if (!v) notFound();

  const portada = v.fotos[0];
  const d = dias(v.fecha_inicio, v.fecha_fin);
  const gmaps = v.ruta ? linkGoogleMaps(v.ruta.paradas) : null;
  const hayVideos = v.fotos.some((f) => f.tipo === "video");
  const fotosGps = v.fotos
    .filter((f) => f.lat != null && f.lng != null)
    .map((f) => ({ id: f.id, public_id: f.public_id, tipo: f.tipo, lat: f.lat!, lng: f.lng!, caption: f.caption }));

  return (
    <article className="space-y-8">
      {/* Portada */}
      <header className="relative -mx-4 overflow-hidden md:mx-0 md:rounded-3xl">
        {portada ? (
          <img
            src={cldMiniatura(portada, { w: 1600, h: 800, crop: "fill" })}
            srcSet={portada.tipo === "video" ? undefined : cldSrcSet(portada.public_id, [800, 1200, 1600, 2400])}
            sizes="(min-width: 1152px) 1152px, 100vw"
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
        </div>
      </header>

      {/* Datos */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Dato icono={Route} label="Recorrido" valor={km(v.km)} destacado />
        <Dato icono={CalendarDays} label={d === 1 ? "Día" : "Días"} valor={num(d)} />
        <Dato icono={TrendingUp} label="Promedio por día" valor={km(Math.round(v.km / d))} />
        <Dato icono={Motorbike} label="Moto" valor={v.motos?.nombre ?? "—"} />
        {v.odometro_inicio !== null && <Dato icono={Gauge} label="Odómetro salida" valor={num(v.odometro_inicio)} />}
        {v.odometro_fin !== null && <Dato icono={Gauge} label="Odómetro llegada" valor={num(v.odometro_fin)} />}
        {v.ruta && <Dato icono={Milestone} label="Paradas" valor={num(v.ruta.paradas.length)} />}
      </section>

      {(v.gpx_url || v.ruta || fotosGps.length > 0) && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-3xl font-bold uppercase">
              <MapIcon className="size-6 text-naranja" /> Recorrido
            </h2>
            {gmaps && (
              <a href={gmaps} target="_blank" rel="noopener noreferrer" className="btn-ghost py-2">
                <ExternalLink className="size-4" /> Abrir en Google Maps
              </a>
            )}
          </div>
          <div className="h-80 overflow-hidden rounded-2xl border border-linea md:h-[28rem]">
            <MapaRutaLazy url={v.gpx_url} ruta={v.ruta} fotos={fotosGps} />
          </div>
          {v.ruta && v.ruta.paradas.some((p) => p.nombre) && (
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-niebla">
              {v.ruta.paradas.map((p, i) => (
                <li key={i} className="flex items-center gap-2">
                  {i > 0 && <ArrowRight className="size-3.5 opacity-50" />}
                  <span className={i === 0 || i === v.ruta!.paradas.length - 1 ? "text-white" : ""}>
                    {p.nombre || `Parada ${i + 1}`}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {v.notas && (
        <section className="card p-6">
          <h2 className="label flex items-center gap-2">
            <NotebookPen className="size-3.5" /> Notas
          </h2>
          <p className="leading-relaxed whitespace-pre-line text-white/90">{v.notas}</p>
        </section>
      )}

      {v.fotos.length > 0 && (
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 font-display text-3xl font-bold uppercase">
            <Images className="size-6 text-naranja" />
            {hayVideos ? "Fotos y videos" : "Fotos"} <span className="text-niebla">· {v.fotos.length}</span>
          </h2>
          <Galeria fotos={v.fotos} titulo={v.titulo} agrupar="dia" fechaInicio={v.fecha_inicio} />
        </section>
      )}

      <footer className="flex flex-wrap justify-between gap-3 border-t border-linea pt-6">
        <Link href="/viajes" className="btn-ghost">
          <ArrowLeft className="size-4" /> Viajes
        </Link>
        <div className="flex gap-2">
          <ConfirmButton
            action={eliminarViaje.bind(null, v.id)}
            mensaje="¿Borrar este viaje con todas sus fotos y videos? No se puede deshacer."
          >
            <Trash2 className="size-4" /> Borrar
          </ConfirmButton>
          <Link href={`/viajes/${v.id}/editar`} className="btn-primary">
            <Pencil className="size-4" /> Editar
          </Link>
        </div>
      </footer>
    </article>
  );
}

function Dato({
  icono: Icono,
  label,
  valor,
  destacado,
}: {
  icono: LucideIcon;
  label: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div className={`card p-4 ${destacado ? "border-naranja/50" : ""}`}>
      <p className="flex items-center gap-1.5 text-xs text-niebla">
        <Icono className="size-3.5" /> {label}
      </p>
      <p className={`font-display text-2xl font-bold ${destacado ? "text-naranja" : ""}`}>{valor}</p>
    </div>
  );
}
