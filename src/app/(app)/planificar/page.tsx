import { getGastos, getMotos } from "@/lib/queries";
import { consumoTanqueLleno } from "@/lib/gastos";
import { Planificador, type MotoPlan } from "@/components/Planificador";

export const metadata = { title: "Planificar viaje" };

export default async function PlanificarPage() {
  const [motos, gastos] = await Promise.all([getMotos(), getGastos().catch(() => [])]);
  const nafta = gastos.filter((g) => g.tipo === "nafta" && g.litros && g.monto > 0);

  // Por moto: consumo real (tanque lleno) y último precio de la nafta que cargaste
  const datos: MotoPlan[] = motos.map((m) => {
    const propias = nafta.filter((g) => g.moto_id === m.id);
    return {
      id: m.id,
      nombre: m.nombre,
      tanque: m.tanque_litros ?? null,
      consumo: consumoTanqueLleno(propias),
    };
  });
  const ultima = nafta[0]; // getGastos viene ordenado por fecha, más nuevo primero
  const precio = ultima ? Math.round(ultima.monto / Number(ultima.litros)) : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-5xl font-bold uppercase">Planificar</h1>
        <p className="text-sm text-niebla">
          Marcá la ruta y te calculo la nafta, el costo y los tramos sin estaciones según la autonomía de tu moto.
        </p>
      </div>
      <Planificador motos={datos} precio={precio} />
    </div>
  );
}
