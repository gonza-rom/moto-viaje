"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { borrarMedios, borrarRaw } from "@/lib/cloudinary";
import { SESSION_COOKIE, safeEqual, sessionToken } from "@/lib/auth";
import { requerirSesion } from "@/lib/sesion";
import { limpiarFallos, minutosBloqueo, registrarFallo } from "@/lib/limite";
import type { FotoDraft } from "@/lib/types";
import { parseRuta } from "@/lib/ruta";

/** ir: adónde navegar después de guardar (lo hace el formulario; ver ViajeForm) */
export type Estado = { error?: string; ok?: string; ir?: string } | undefined;

/** Error con mensaje pensado para mostrarle al usuario */
class ErrorUsuario extends Error {}

/** Traduce errores de Supabase/red a algo entendible */
function mensaje(e: unknown, accion: string) {
  if (e instanceof ErrorUsuario) return e.message;
  const m = (e as Error)?.message || String(e);
  console.error(`Error al ${accion}:`, m);
  if (/column .* does not exist|schema cache/i.test(m)) {
    return `No se pudo ${accion}: a la base le faltan columnas. Corré supabase/schema.sql en el SQL Editor de Supabase.`;
  }
  if (/fetch failed|network|ECONN|timeout/i.test(m)) return `No se pudo ${accion}: problema de conexión. Probá de nuevo.`;
  return `No se pudo ${accion}: ${m}`;
}

/* ───────────── Auth ───────────── */

async function ipCliente() {
  const h = await headers();
  return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0].trim() || "desconocida";
}

export async function login(_prev: Estado, fd: FormData): Promise<Estado> {
  const ip = await ipCliente();
  const espera = await minutosBloqueo(ip);
  if (espera) return { error: `Demasiados intentos fallidos. Esperá ${espera} min y probá de nuevo.` };

  const pass = String(fd.get("password") || "");
  const real = process.env.APP_PASSWORD || "";
  if (!real || !safeEqual(pass, real)) {
    await registrarFallo(ip);
    // Frena intentos en serie
    await new Promise((r) => setTimeout(r, 800));
    return { error: "Contraseña incorrecta" };
  }

  await limpiarFallos(ip);
  (await cookies()).set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  redirect("/");
}

export async function logout() {
  await requerirSesion();
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

/* ───────────── Helpers ───────────── */

const str = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const int = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (v === null) return null;
  const n = parseInt(v.replace(/\./g, ""), 10);
  if (!Number.isFinite(n)) throw new ErrorUsuario(`"${v}" no es un número válido`);
  return n;
};
const dec = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (v === null) return null;
  const n = parseFloat(v.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  if (!Number.isFinite(n)) throw new ErrorUsuario(`"${v}" no es un número válido`);
  return n;
};

function datosViaje(fd: FormData) {
  const titulo = str(fd, "titulo");
  const fecha_inicio = str(fd, "fecha_inicio");
  const fecha_fin = str(fd, "fecha_fin");
  if (!titulo) throw new ErrorUsuario("Falta el título del viaje");
  if (!fecha_inicio) throw new ErrorUsuario("Falta la fecha de salida");
  if (fecha_fin && fecha_fin < fecha_inicio) throw new ErrorUsuario("La fecha de regreso es anterior a la de salida");

  const odometro_inicio = int(fd, "odometro_inicio");
  const odometro_fin = int(fd, "odometro_fin");
  if (odometro_inicio !== null && odometro_fin !== null && odometro_fin < odometro_inicio) {
    throw new ErrorUsuario("El odómetro de llegada es menor que el de salida");
  }
  let km = dec(fd, "km");
  if (km === null && odometro_inicio !== null && odometro_fin !== null) km = odometro_fin - odometro_inicio;
  if (km !== null && (km < 0 || km > 100000)) throw new ErrorUsuario("Los km recorridos no parecen correctos");

  return {
    titulo: titulo.slice(0, 200),
    fecha_inicio,
    fecha_fin,
    origen: str(fd, "origen"),
    destino: str(fd, "destino"),
    km: km ?? 0,
    odometro_inicio,
    odometro_fin,
    moto_id: str(fd, "moto_id"),
    notas: str(fd, "notas"),
    gpx_public_id: str(fd, "gpx_public_id"),
    gpx_url: str(fd, "gpx_url"),
    ruta: parseRuta(fd.get("ruta")),
    diario: parseDiario(fd.get("diario"), fecha_inicio, fecha_fin),
    etiquetas: parseEtiquetas(fd.get("etiquetas")),
  };
}

/** { "YYYY-MM-DD": texto } solo con días dentro del viaje y texto no vacío */
function parseDiario(raw: FormDataEntryValue | null, inicio: string, fin: string | null) {
  try {
    const v = JSON.parse(String(raw || "{}"));
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const out: Record<string, string> = {};
    for (const [k, t] of Object.entries(v)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || typeof t !== "string" || !t.trim()) continue;
      if (k < inicio || k > (fin || inicio)) continue;
      out[k] = t.trim().slice(0, 5000);
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

function parseEtiquetas(raw: FormDataEntryValue | null): string[] {
  try {
    const v = JSON.parse(String(raw || "[]"));
    if (!Array.isArray(v)) return [];
    const limpias = v
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 30))
      .filter(Boolean);
    return [...new Set(limpias)].slice(0, 15);
  } catch {
    return [];
  }
}

function fotosDelForm(fd: FormData): FotoDraft[] {
  try {
    const arr = JSON.parse(String(fd.get("fotos") || "[]"));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((f) => typeof f?.public_id === "string")
      .map((f) => {
        const coord = (n: unknown, max: number) =>
          typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= max ? n : null;
        const lat = coord(f.lat, 90);
        const lng = coord(f.lng, 180);
        const conGps = lat !== null && lng !== null;
        return {
          ...f,
          tipo: f.tipo === "video" ? "video" : "image",
          duracion: Number(f.duracion) || null,
          tomada_en:
            typeof f.tomada_en === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(f.tomada_en)
              ? f.tomada_en
              : null,
          lat: conGps ? lat : null,
          lng: conGps ? lng : null,
          favorita: f.favorita === true,
        };
      });
  } catch {
    return [];
  }
}

const filaFoto = (viaje_id: string) => (f: FotoDraft, i: number) => ({
  ...(f.id ? { id: f.id } : {}),
  viaje_id,
  tipo: f.tipo,
  public_id: f.public_id,
  width: f.width,
  height: f.height,
  duracion: f.duracion,
  caption: f.caption?.trim().slice(0, 500) || null,
  orden: i,
  tomada_en: f.tomada_en,
  lat: f.lat,
  lng: f.lng,
  favorita: f.favorita,
});

function refrescar(id?: string) {
  revalidatePath("/");
  revalidatePath("/viajes");
  revalidatePath("/motos");
  revalidatePath("/fotos");
  if (id) revalidatePath(`/viajes/${id}`);
}

/* ───────────── Viajes ───────────── */

export async function crearViaje(_prev: Estado, fd: FormData): Promise<Estado> {
  await requerirSesion();
  let id: string;
  try {
    const datos = datosViaje(fd);
    const fotos = fotosDelForm(fd);

    const { data, error } = await db().from("viajes").insert(datos).select("id").single();
    if (error) throw error;
    id = data.id;

    if (fotos.length) {
      const { error: e2 } = await db().from("fotos").insert(fotos.map(filaFoto(id)));
      if (e2) {
        // Deshacer: que no quede un viaje a medias
        await db().from("viajes").delete().eq("id", id);
        throw e2;
      }
    }
  } catch (e) {
    return { error: mensaje(e, "guardar el viaje") };
  }

  refrescar(id);
  // Sin redirect(): la navegación la hace el formulario (un redirect dentro de la action
  // envuelta deja la transición colgada en "Guardando…")
  return { ok: "Guardado", ir: `/viajes/${id}` };
}

export async function actualizarViaje(id: string, _prev: Estado, fd: FormData): Promise<Estado> {
  await requerirSesion();
  try {
    const datos = datosViaje(fd);
    const fotos = fotosDelForm(fd);

    const { data: actual, error: e0 } = await db()
      .from("viajes")
      .select("gpx_public_id, fotos(id, public_id, tipo)")
      .eq("id", id)
      .single();
    if (e0) throw e0;

    const { error } = await db().from("viajes").update(datos).eq("id", id);
    if (error) throw error;

    const filas = fotos.map(filaFoto(id));
    const viejas = filas.filter((f) => "id" in f);
    const nuevas = filas.filter((f) => !("id" in f));
    if (viejas.length) {
      const { error: e1 } = await db().from("fotos").upsert(viejas);
      if (e1) throw e1;
    }
    if (nuevas.length) {
      const { error: e2 } = await db().from("fotos").insert(nuevas);
      if (e2) throw e2;
    }

    // Recién cuando todo se guardó, borrar lo que se quitó (DB + Cloudinary)
    const existentes = (actual.fotos || []) as { id: string; public_id: string; tipo: string }[];
    const idsQuedan = new Set(fotos.filter((f) => f.id).map((f) => f.id));
    const eliminar = existentes.filter((f) => !idsQuedan.has(f.id));
    if (eliminar.length) {
      await db().from("fotos").delete().in("id", eliminar.map((f) => f.id));
      await borrarMedios(eliminar);
    }
    if (actual.gpx_public_id && actual.gpx_public_id !== datos.gpx_public_id) {
      await borrarRaw(actual.gpx_public_id);
    }
  } catch (e) {
    return { error: mensaje(e, "guardar los cambios") };
  }

  refrescar(id);
  // Sin redirect(): la navegación la hace el formulario (un redirect dentro de la action
  // envuelta deja la transición colgada en "Guardando…")
  return { ok: "Guardado", ir: `/viajes/${id}` };
}

export async function eliminarViaje(id: string) {
  await requerirSesion();
  const { data } = await db()
    .from("viajes")
    .select("gpx_public_id, fotos(public_id, tipo)")
    .eq("id", id)
    .single();

  const { error } = await db().from("viajes").delete().eq("id", id);
  if (error) throw new Error(mensaje(error, "borrar el viaje"));

  if (data) {
    await borrarMedios((data.fotos || []) as { public_id: string; tipo: string }[]);
    await borrarRaw(data.gpx_public_id);
  }

  refrescar();
  redirect("/viajes");
}

/* ───────────── Fotos ───────────── */

export async function marcarFavorita(id: string, favorita: boolean): Promise<Estado> {
  await requerirSesion();
  const { data, error } = await db().from("fotos").update({ favorita }).eq("id", id).select("viaje_id").single();
  if (error) return { error: mensaje(error, "marcar la favorita") };
  void data; // sin revalidar la página actual (ver nota en acciones-extra.ts)
  return { ok: favorita ? "Agregada a favoritas" : "Quitada de favoritas" };
}

/* ───────────── Motos ───────────── */

function datosMoto(fd: FormData) {
  const nombre = str(fd, "nombre");
  if (!nombre) throw new ErrorUsuario("Falta el nombre de la moto");
  const anio = int(fd, "anio");
  if (anio !== null && (anio < 1900 || anio > new Date().getFullYear() + 1)) throw new ErrorUsuario("El año no parece correcto");
  return {
    nombre: nombre.slice(0, 100),
    modelo: str(fd, "modelo"),
    anio,
    km_iniciales: int(fd, "km_iniciales") ?? 0,
  };
}

export async function crearMoto(_prev: Estado, fd: FormData): Promise<Estado> {
  await requerirSesion();
  try {
    const { error } = await db().from("motos").insert(datosMoto(fd));
    if (error) throw error;
  } catch (e) {
    return { error: mensaje(e, "agregar la moto") };
  }
  // Sin revalidar /motos (es la página actual): MotoForm recarga la página
  return { ok: "Moto agregada" };
}

export async function actualizarMoto(id: string, _prev: Estado, fd: FormData): Promise<Estado> {
  await requerirSesion();
  try {
    const { error } = await db().from("motos").update(datosMoto(fd)).eq("id", id);
    if (error) throw error;
  } catch (e) {
    return { error: mensaje(e, "guardar la moto") };
  }
  return { ok: "Cambios guardados" };
}

export async function eliminarMoto(id: string) {
  await requerirSesion();
  const { error } = await db().from("motos").delete().eq("id", id);
  if (error) throw new Error(mensaje(error, "borrar la moto"));
  // Sin revalidar: el botón recarga la página (ver ConfirmButton recargar)
}

/* ───────────── Limpieza de borradores ───────────── */

/**
 * Borra de Cloudinary un archivo subido en el formulario y quitado antes de guardar.
 * Solo si no está en la base (nunca borra fotos de viajes guardados).
 */
export async function descartarSubida(publicId: string, tipo: "image" | "video" | "raw") {
  await requerirSesion();
  if (typeof publicId !== "string" || !publicId.startsWith(`${process.env.CLOUDINARY_FOLDER || "moto-viajes"}/`)) return;
  // Ante cualquier error de la base, no borrar nada
  if (tipo === "raw") {
    const { count, error } = await db().from("viajes").select("id", { count: "exact", head: true }).eq("gpx_public_id", publicId);
    if (!error && count === 0) await borrarRaw(publicId);
    return;
  }
  const { count, error } = await db().from("fotos").select("id", { count: "exact", head: true }).eq("public_id", publicId);
  if (!error && count === 0) await borrarMedios([{ public_id: publicId, tipo }]);
}
