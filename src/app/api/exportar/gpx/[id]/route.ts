import { NextResponse } from "next/server";
import { getViaje } from "@/lib/queries";

// GPX de la ruta marcada (o el GPX subido) para usar en Google Maps, Calimoto, OsmAnd, etc.
// Protegido por el middleware (requiere sesión).

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
const nombreArchivo = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "viaje";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await getViaje((await params).id);
  if (!v) return NextResponse.json({ error: "No existe" }, { status: 404 });

  let gpx: string;
  if (v.ruta && v.ruta.trazo.length > 1) {
    const wpts = v.ruta.paradas
      .map((p, i) => `  <wpt lat="${p.lat}" lon="${p.lng}"><name>${esc(p.nombre || `Parada ${i + 1}`)}</name></wpt>`)
      .join("\n");
    const rtepts = v.ruta.paradas.map((p) => `    <rtept lat="${p.lat}" lon="${p.lng}"/>`).join("\n");
    const trkpts = v.ruta.trazo.map(([la, lo]) => `      <trkpt lat="${la}" lon="${lo}"/>`).join("\n");
    gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Mis viajes en moto" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(v.titulo)}</name><time>${v.fecha_inicio}T00:00:00Z</time></metadata>
${wpts}
  <rte><name>${esc(v.titulo)}</name>
${rtepts}
  </rte>
  <trk><name>${esc(v.titulo)}</name><trkseg>
${trkpts}
  </trkseg></trk>
</gpx>
`;
  } else if (v.gpx_url) {
    const r = await fetch(v.gpx_url);
    if (!r.ok) return NextResponse.json({ error: "No se pudo leer el GPX" }, { status: 502 });
    gpx = await r.text();
  } else {
    return NextResponse.json({ error: "Este viaje no tiene ruta" }, { status: 404 });
  }

  return new NextResponse(gpx, {
    headers: {
      "Content-Type": "application/gpx+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivo(v.titulo)}.gpx"`,
    },
  });
}
