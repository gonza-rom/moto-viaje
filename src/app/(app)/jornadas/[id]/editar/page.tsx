import { notFound } from "next/navigation";
import { getJornada, getMotos } from "@/lib/queries";
import { JornadaForm } from "@/components/JornadaForm";

export const metadata = { title: "Editar jornada" };

export default async function EditarJornadaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [j, motos] = await Promise.all([getJornada(id), getMotos()]);
  if (!j) notFound();
  return (
    <div className="space-y-6">
      <h1 className="font-display text-5xl font-bold uppercase">Editar jornada</h1>
      <JornadaForm jornada={j} motos={motos} />
    </div>
  );
}
