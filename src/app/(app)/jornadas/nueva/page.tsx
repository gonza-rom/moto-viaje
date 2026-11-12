import { getMotos } from "@/lib/queries";
import { JornadaForm } from "@/components/JornadaForm";

export const metadata = { title: "Nueva jornada" };

export default async function NuevaJornadaPage() {
  const motos = await getMotos();
  return (
    <div className="space-y-6">
      <h1 className="font-display text-5xl font-bold uppercase">Nueva jornada</h1>
      <JornadaForm motos={motos} />
    </div>
  );
}
