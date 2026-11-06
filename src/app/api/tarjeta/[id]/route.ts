// Tarjeta del viaje para descargar o compartir (protegida por el middleware: /api pide sesión)
import { getViaje } from "@/lib/queries";
import { tarjetaViaje, type Formato } from "@/lib/tarjeta";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("No encontrado", { status: 404 });
  const v = await getViaje(id);
  if (!v) return new Response("No encontrado", { status: 404 });
  const u = new URL(req.url);
  const formato: Formato = u.searchParams.get("formato") === "og" ? "og" : "cuadrado";
  const nombre = v.titulo.normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase().slice(0, 60) || "viaje";
  return tarjetaViaje(v, formato, {
    "Cache-Control": "private, no-store",
    ...(u.searchParams.has("descargar") ? { "Content-Disposition": `attachment; filename="${nombre}.png"` } : {}),
  });
}
