// Firma para que un acompañante suba fotos al álbum compartido (sin sesión: valida el token del álbum)
import { NextResponse } from "next/server";
import { getViajeAlbum } from "@/lib/queries";
import { firmarSubidaAlbum } from "@/lib/album";

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const v = await getViajeAlbum((await params).token).catch(() => null);
  if (!v) return NextResponse.json({ error: "El link del álbum ya no está activo" }, { status: 404 });
  return NextResponse.json(firmarSubidaAlbum(), { headers: { "Cache-Control": "no-store" } });
}
