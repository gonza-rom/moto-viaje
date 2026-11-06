import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getViajeCompartido } from "@/lib/queries";
import { rangoFechas } from "@/lib/format";
import { RepeticionLazy } from "@/components/mapas";

// Repetición animada en el link público (sin login)
type Props = { params: Promise<{ token: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const v = await getViajeCompartido((await params).token);
  return { title: v ? `${v.titulo} · Recorrido animado` : "Viaje no disponible", robots: { index: false, follow: false } };
}

export default async function RecorridoPublico({ params }: Props) {
  const { token } = await params;
  const v = await getViajeCompartido(token);
  if (!v) notFound();
  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <Link href={`/c/${token}`} className="inline-flex items-center gap-1.5 text-sm text-niebla hover:text-white">
        <ArrowLeft className="size-4" /> Volver al viaje
      </Link>
      <div>
        <h1 className="font-display text-4xl font-bold uppercase">{v.titulo}</h1>
        <p className="text-sm text-niebla">{rangoFechas(v.fecha_inicio, v.fecha_fin)}</p>
      </div>
      <RepeticionLazy gpxUrl={v.gpx_url} trazo={v.ruta?.trazo ?? null} fotos={v.fotos} lugares={v.lugares ?? []} fechaInicio={v.fecha_inicio} fechaFin={v.fecha_fin} />
    </main>
  );
}
