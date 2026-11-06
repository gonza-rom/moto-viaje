// Vista previa del link compartido (WhatsApp, Telegram, etc.): la tarjeta del viaje
import { getViajeCompartido } from "@/lib/queries";
import { TAMANOS, tarjetaViaje } from "@/lib/tarjeta";

export const runtime = "nodejs";
export const size = TAMANOS.og;
export const contentType = "image/png";
export const alt = "Viaje en moto";

export default async function Imagen({ params }: { params: Promise<{ token: string }> }) {
  const v = await getViajeCompartido((await params).token);
  if (!v) return new Response("No encontrado", { status: 404 });
  return tarjetaViaje(v, "og");
}
