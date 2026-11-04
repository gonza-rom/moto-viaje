import { getMotos } from "@/lib/queries";
import { ViajeForm } from "@/components/ViajeForm";
import { crearViaje } from "@/app/actions";

export const metadata = { title: "Nuevo viaje" };

export default async function NuevoViajePage() {
  const motos = await getMotos();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-5xl font-bold uppercase">Nuevo viaje</h1>
      <ViajeForm motos={motos} action={crearViaje} />
    </div>
  );
}
