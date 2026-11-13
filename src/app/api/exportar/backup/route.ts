import { NextResponse } from "next/server";
import { db, traerTodo } from "@/lib/supabase";

// Copia de seguridad de todos los datos en JSON (las fotos quedan en Cloudinary; acá van sus IDs).
// Protegido por el middleware (requiere sesión).

export async function GET() {
  const tablas = ["motos", "viajes", "fotos", "gastos", "mantenimientos", "planes", "jornadas"] as const;
  const out: Record<string, unknown> = {
    app: "moto-viajes",
    version: 1,
    exportado: new Date().toISOString(),
    cloudinary_cloud: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  };
  for (const t of tablas) {
    try {
      // De a 1000 filas (máximo por pedido): con muchas fotos, la copia quedaba incompleta
      out[t] = await traerTodo((desde, hasta) => db().from(t).select("*").order("id").range(desde, hasta));
    } catch (e) {
      return NextResponse.json({ error: `${t}: ${(e as Error).message}` }, { status: 500 });
    }
  }
  const fecha = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="moto-viajes-backup-${fecha}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
