import Link from "next/link";
import { Camera, Film, Heart, ImagePlus, Images, MapPin } from "lucide-react";
import { getFotos, getMotos } from "@/lib/queries";
import { num } from "@/lib/format";
import { Galeria } from "@/components/Galeria";
import { MapaRutaLazy } from "@/components/mapas";

export const metadata = { title: "Fotos" };

export default async function FotosPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string; moto?: string }>;
}) {
  const { anio = "", moto = "" } = await searchParams;
  const [todas, motos] = await Promise.all([getFotos(), getMotos()]);

  const anios = [...new Set(todas.map((f) => f.viajes?.fecha_inicio.slice(0, 4)).filter(Boolean) as string[])]
    .sort()
    .reverse();
  const fotos = todas.filter(
    (f) => (!anio || f.viajes?.fecha_inicio.startsWith(anio)) && (!moto || f.viajes?.moto_id === moto)
  );

  const nVideos = fotos.filter((f) => f.tipo === "video").length;
  const nFavs = fotos.filter((f) => f.favorita).length;
  const conGps = fotos
    .filter((f) => f.lat != null && f.lng != null)
    .map((f) => ({ id: f.id, public_id: f.public_id, tipo: f.tipo, lat: f.lat!, lng: f.lng!, caption: f.caption }));

  if (!todas.length) {
    return (
      <div className="card mx-auto max-w-lg space-y-4 p-10 text-center">
        <Images className="mx-auto size-12 text-niebla" strokeWidth={1.5} />
        <h1 className="font-display text-4xl font-bold uppercase">Sin fotos todavía</h1>
        <p className="text-niebla">Las fotos y videos que subas a tus viajes aparecen acá, todas juntas.</p>
        <Link href="/viajes/nuevo" className="btn-primary">
          <ImagePlus className="size-4" /> Cargar un viaje
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-5xl font-bold uppercase">Fotos</h1>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-niebla">
            <span className="flex items-center gap-1.5">
              <Camera className="size-4" /> {num(fotos.length - nVideos)} fotos
            </span>
            {nVideos > 0 && (
              <span className="flex items-center gap-1.5">
                <Film className="size-4" /> {num(nVideos)} videos
              </span>
            )}
            {nFavs > 0 && (
              <span className="flex items-center gap-1.5">
                <Heart className="size-4" /> {num(nFavs)} favoritas
              </span>
            )}
            {conGps.length > 0 && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4" /> {num(conGps.length)} con ubicación
              </span>
            )}
          </p>
        </div>
        {(anios.length > 1 || motos.length > 1) && (
          <form className="flex gap-2">
            {anios.length > 1 && (
              <select name="anio" defaultValue={anio} className="input w-28">
                <option value="">Todos</option>
                {anios.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            )}
            {motos.length > 1 && (
              <select name="moto" defaultValue={moto} className="input w-40">
                <option value="">Todas las motos</option>
                {motos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            )}
            <button className="btn-ghost">Filtrar</button>
          </form>
        )}
      </div>

      {conGps.length > 0 && (
        <section className="space-y-2">
          <h2 className="label flex items-center gap-1.5">
            <MapPin className="size-3.5" /> Dónde las sacaste · tocá una para verla
          </h2>
          <div className="h-72 overflow-hidden rounded-2xl border border-linea md:h-96">
            <MapaRutaLazy fotos={conGps} />
          </div>
        </section>
      )}

      {fotos.length ? (
        <Galeria fotos={fotos} agrupar="viaje" />
      ) : (
        <p className="card p-8 text-center text-niebla">No hay fotos con ese filtro.</p>
      )}
    </div>
  );
}
