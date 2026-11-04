import Link from "next/link";
import { ArrowRight, Calendar, Camera, Film, MapPinned, Motorbike, Route } from "lucide-react";
import { cldMiniatura } from "@/lib/cld";
import { km, rangoFechas } from "@/lib/format";
import type { ViajeConRelaciones } from "@/lib/types";

export function ViajeCard({ v }: { v: ViajeConRelaciones }) {
  const portada = v.fotos[0];
  const nVideos = v.fotos.filter((f) => f.tipo === "video").length;
  const nFotos = v.fotos.length - nVideos;
  const tieneRuta = !!(v.ruta || v.gpx_url);

  return (
    <Link href={`/viajes/${v.id}`} className="group card block overflow-hidden transition hover:border-niebla/60">
      <div className="relative aspect-[4/3] overflow-hidden bg-grafito">
        {portada ? (
          <img
            src={cldMiniatura(portada, { w: 640, h: 480, crop: "fill" })}
            alt={v.titulo}
            loading="lazy"
            className="size-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid size-full place-items-center text-niebla/40">
            <Route className="size-14" strokeWidth={1.25} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-3 pt-10">
          <p className="font-display text-3xl leading-none font-bold text-white">{km(v.km)}</p>
        </div>
        <div className="absolute top-2 right-2 flex gap-1.5">
          {tieneRuta && (
            <span className="grid size-7 place-items-center rounded-full bg-black/60 text-white" title="Tiene ruta">
              <MapPinned className="size-3.5" />
            </span>
          )}
          {nFotos > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
              <Camera className="size-3.5" /> {nFotos}
            </span>
          )}
          {nVideos > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
              <Film className="size-3.5" /> {nVideos}
            </span>
          )}
        </div>
      </div>
      <div className="space-y-1.5 p-4">
        <h3 className="line-clamp-1 font-semibold">{v.titulo}</h3>
        <p className="flex items-center gap-1.5 text-xs text-niebla">
          <Calendar className="size-3.5 shrink-0" /> {rangoFechas(v.fecha_inicio, v.fecha_fin)}
          {v.motos && (
            <>
              <span className="mx-1 opacity-40">·</span>
              <Motorbike className="size-3.5 shrink-0" /> <span className="truncate">{v.motos.nombre}</span>
            </>
          )}
        </p>
        {(v.origen || v.destino) && (
          <p className="flex items-center gap-1.5 text-xs text-niebla">
            <span className="truncate">{v.origen || "—"}</span>
            <ArrowRight className="size-3 shrink-0" />
            <span className="truncate">{v.destino || "—"}</span>
          </p>
        )}
      </div>
    </Link>
  );
}
