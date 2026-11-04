import { notFound } from "next/navigation";
import { getMotos, getViaje } from "@/lib/queries";
import { ViajeForm } from "@/components/ViajeForm";
import { actualizarViaje } from "@/app/actions";

export const metadata = { title: "Editar viaje" };

export default async function EditarViajePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [viaje, motos] = await Promise.all([getViaje(id), getMotos()]);
  if (!viaje) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-5xl font-bold uppercase">Editar viaje</h1>
      <ViajeForm motos={motos} viaje={viaje} action={actualizarViaje.bind(null, id)} />
    </div>
  );
}
