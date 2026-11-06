import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getViaje } from "@/lib/queries";
import { rangoFechas } from "@/lib/format";
import { RepeticionLazy } from "@/components/mapas";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const v = await getViaje((await params).id);
  return { title: v ? `${v.titulo} · Recorrido animado` : "Recorrido" };
}

export default async function RecorridoPage({ params }: Props) {
  const v = await getViaje((await params).id);
  if (!v) notFound();
  return (
    <div className="space-y-4">
      <Link href={`/viajes/${v.id}`} className="inline-flex items-center gap-1.5 text-sm text-niebla hover:text-white">
        <ArrowLeft className="size-4" /> Volver al viaje
      </Link>
      <div>
        <h1 className="font-display text-4xl font-bold uppercase">{v.titulo}</h1>
        <p className="text-sm text-niebla">{rangoFechas(v.fecha_inicio, v.fecha_fin)}</p>
      </div>
      <RepeticionLazy gpxUrl={v.gpx_url} trazo={v.ruta?.trazo ?? null} fotos={v.fotos} lugares={v.lugares ?? []} fechaInicio={v.fecha_inicio} fechaFin={v.fecha_fin} />
    </div>
  );
}
