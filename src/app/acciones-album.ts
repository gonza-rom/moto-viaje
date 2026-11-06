"use server";

// Álbum compartido: un acompañante agrega fotos al viaje con el link (sin la contraseña).
// No usa requerirSesion(): el permiso es el token del álbum, que se valida en cada llamada.

import { db } from "@/lib/supabase";
import { cloudinary } from "@/lib/cloudinary";
import { getViajeAlbum } from "@/lib/queries";
import { ALBUM_FOLDER, ALBUM_MAX_FOTOS } from "@/lib/album";

type FotoAlbum = { public_id: string; tomada_en: string | null; lat: number | null; lng: number | null; caption?: string };

export async function agregarFotoAlbum(token: string, f: FotoAlbum, nombre: string): Promise<{ ok?: true; error?: string }> {
  const v = await getViajeAlbum(String(token ?? "")).catch(() => null);
  if (!v) return { error: "El link del álbum ya no está activo" };

  const quien = String(nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!quien) return { error: "Poné tu nombre" };
  const publicId = String(f?.public_id ?? "");
  if (!publicId.startsWith(`${ALBUM_FOLDER}/`) || publicId.length > 200) return { error: "Foto inválida" };

  // La foto tiene que existir en Cloudinary y ser recién subida (evita agregar fotos ajenas)
  let meta: { width: number; height: number; created_at: string };
  try {
    meta = await cloudinary.api.resource(publicId, { resource_type: "image" });
  } catch {
    return { error: "No se encontró la foto subida" };
  }
  if (Date.now() - Date.parse(meta.created_at) > 2 * 60 * 60 * 1000) return { error: "Foto inválida" };

  const { count } = await db().from("fotos").select("id", { count: "exact", head: true }).eq("viaje_id", v.id).not("subida_por", "is", null);
  if ((count ?? 0) >= ALBUM_MAX_FOTOS) return { error: "El álbum llegó al máximo de fotos" };
  const { count: ya } = await db().from("fotos").select("id", { count: "exact", head: true }).eq("public_id", publicId);
  if (ya) return { ok: true }; // ya estaba (reintento)

  const coord = (n: unknown, max: number) => (typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= max ? n : null);
  const lat = coord(f.lat, 90);
  const lng = coord(f.lng, 180);
  const tomada = typeof f.tomada_en === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(f.tomada_en) ? f.tomada_en : null;

  const { data: ultima } = await db().from("fotos").select("orden").eq("viaje_id", v.id).order("orden", { ascending: false }).limit(1);
  const { error } = await db()
    .from("fotos")
    .insert({
      viaje_id: v.id,
      tipo: "image",
      public_id: publicId,
      width: meta.width ?? null,
      height: meta.height ?? null,
      caption: typeof f.caption === "string" && f.caption.trim() ? f.caption.trim().slice(0, 300) : null,
      orden: (ultima?.[0]?.orden ?? -1) + 1,
      tomada_en: tomada,
      lat: lat !== null && lng !== null ? lat : null,
      lng: lat !== null && lng !== null ? lng : null,
      subida_por: quien,
    });
  if (error) return { error: "No se pudo guardar la foto" };
  return { ok: true };
}
