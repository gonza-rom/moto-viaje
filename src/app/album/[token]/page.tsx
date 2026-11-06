import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Images, Motorbike } from "lucide-react";
import { getViajeAlbum } from "@/lib/queries";
import { rangoFechas } from "@/lib/format";
import { SubirAlbum } from "@/components/SubirAlbum";

// Álbum compartido: página pública para que un acompañante suba sus fotos al viaje (sin contraseña)
type Props = { params: Promise<{ token: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const v = await getViajeAlbum((await params).token).catch(() => null);
  return { title: v ? `Subí tus fotos · ${v.titulo}` : "Álbum no disponible", robots: { index: false, follow: false } };
}

export default async function AlbumPage({ params }: Props) {
  const { token } = await params;
  const v = await getViajeAlbum(token).catch(() => null);
  if (!v) notFound();
  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <p className="flex items-center gap-2 text-xs font-bold tracking-[0.2em] text-naranja uppercase">
          <Motorbike className="size-4" /> Álbum compartido
        </p>
        <h1 className="font-display text-4xl font-bold uppercase">{v.titulo}</h1>
        <p className="flex items-center gap-3 text-sm text-niebla">
          <span>{rangoFechas(v.fecha_inicio, v.fecha_fin)}</span>
          <span className="flex items-center gap-1">
            <Images className="size-4" /> {v.nFotos} fotos en el viaje
          </span>
        </p>
        <p className="text-sm text-white/80">Te pasaron este link para que sumes tus fotos del viaje. Se agregan solas a la galería.</p>
      </header>
      <SubirAlbum token={token} />
    </main>
  );
}
