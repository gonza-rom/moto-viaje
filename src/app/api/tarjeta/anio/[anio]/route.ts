// "Mi año en moto": tarjeta-resumen de un año (protegida por el middleware: /api pide sesión)
import { getViajes } from "@/lib/queries";
import { dias } from "@/lib/format";
import { puntosDe, tarjetaAnio, type Formato } from "@/lib/tarjeta";
import { provinciaDelMapa } from "@/components/MapaProvincias";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ anio: string }> }) {
  const anio = Number((await params).anio);
  if (!Number.isInteger(anio) || anio < 1990 || anio > 2100) return new Response("Año inválido", { status: 400 });
  const viajes = (await getViajes()).filter((v) => v.fecha_inicio.startsWith(String(anio)));
  if (!viajes.length) return new Response("Sin viajes ese año", { status: 404 });

  // Provincias: recorrido, paradas y fotos (como en Estadísticas)
  const provincias = new Set<string>();
  for (const v of viajes) {
    const nombres = [
      ...(v.lugares ?? []).map((l) => l.provincia),
      ...(v.ruta?.paradas ?? []).map((p) => p.provincia),
      ...v.fotos.map((f) => f.provincia),
    ];
    for (const n of nombres) {
      const p = n ? provinciaDelMapa(n) : undefined;
      if (p) provincias.add(p);
    }
  }

  // Foto de fondo: una favorita del año, si no la portada del viaje más largo
  const favorita = viajes.flatMap((v) => v.fotos).find((f) => f.favorita);
  const masLargo = [...viajes].sort((a, b) => b.km - a.km)[0];
  const foto = favorita ?? masLargo.fotos[0] ?? viajes.find((v) => v.fotos.length)?.fotos[0] ?? null;

  const alturas = viajes.map((v) => v.altimetria?.max).filter((n): n is number => typeof n === "number");
  const recorridos = await Promise.all(viajes.map((v) => puntosDe(v)));

  const u = new URL(req.url);
  const formato: Formato = u.searchParams.get("formato") === "og" ? "og" : "cuadrado";
  return tarjetaAnio(
    {
      anio,
      km: viajes.reduce((s, v) => s + Number(v.km), 0),
      viajes: viajes.length,
      dias: viajes.reduce((s, v) => s + dias(v.fecha_inicio, v.fecha_fin), 0),
      provincias: [...provincias],
      alturaMax: alturas.length ? Math.max(...alturas) : null,
      foto: foto ? { public_id: foto.public_id, tipo: foto.tipo } : null,
      recorridos,
    },
    formato,
    {
      "Cache-Control": "private, no-store",
      ...(u.searchParams.has("descargar") ? { "Content-Disposition": `attachment; filename="mi-${anio}-en-moto.png"` } : {}),
    }
  );
}
