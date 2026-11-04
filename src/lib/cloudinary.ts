import "server-only";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const CLD_FOLDER = process.env.CLOUDINARY_FOLDER || "moto-viajes";

/** Borra fotos y videos de Cloudinary (agrupa por resource_type) */
export async function borrarMedios(medios: { public_id: string; tipo?: string | null }[]) {
  for (const tipo of ["image", "video"] as const) {
    const ids = medios.filter((m) => (m.tipo === "video" ? "video" : "image") === tipo).map((m) => m.public_id);
    try {
      // La API acepta hasta 100 por llamada
      for (let i = 0; i < ids.length; i += 100) {
        await cloudinary.api.delete_resources(ids.slice(i, i + 100), { resource_type: tipo, invalidate: true });
      }
    } catch (e) {
      console.error(`Cloudinary: error borrando ${tipo}`, e);
    }
  }
}

export async function borrarRaw(publicId: string | null | undefined) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "raw", invalidate: true });
  } catch (e) {
    console.error("Cloudinary: error borrando GPX", e);
  }
}

export { cloudinary };
