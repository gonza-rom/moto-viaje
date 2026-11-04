// Lectura de EXIF en el navegador (fecha de la foto y GPS). Solo cliente.

export type DatosExif = { tomada_en: string | null; lat: number | null; lng: number | null };

const p2 = (n: number) => String(n).padStart(2, "0");

/** Date (hora local de la cámara) → "YYYY-MM-DDTHH:mm:ss" sin zona horaria */
function aLocal(d: Date) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

export async function leerExif(file: File): Promise<DatosExif> {
  const vacio: DatosExif = { tomada_en: null, lat: null, lng: null };
  try {
    const exifr = (await import("exifr")).default;
    const d = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      ifd1: false,
      xmp: false,
      icc: false,
      iptc: false,
      jfif: false,
      ihdr: false,
      reviveValues: true,
    });
    if (!d) return vacio;
    const fecha: unknown = d.DateTimeOriginal ?? d.CreateDate ?? d.DateTime;
    const lat = typeof d.latitude === "number" && Number.isFinite(d.latitude) ? d.latitude : null;
    const lng = typeof d.longitude === "number" && Number.isFinite(d.longitude) ? d.longitude : null;
    return {
      tomada_en: fecha instanceof Date && !isNaN(fecha.getTime()) ? aLocal(fecha) : null,
      // 0,0 es "sin GPS" en muchas cámaras
      lat: lat !== null && lng !== null && (lat !== 0 || lng !== 0) ? Math.round(lat * 1e6) / 1e6 : null,
      lng: lat !== null && lng !== null && (lat !== 0 || lng !== 0) ? Math.round(lng * 1e6) / 1e6 : null,
    };
  } catch {
    return vacio;
  }
}
