"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { borrarMedios, borrarRaw } from "@/lib/cloudinary";
import { SESSION_COOKIE, safeEqual, sessionToken } from "@/lib/auth";
import type { FotoDraft } from "@/lib/types";
import { parseRuta } from "@/lib/ruta";

/* ───────────── Auth ───────────── */

export async function login(_prev: { error?: string } | undefined, fd: FormData) {
  const pass = String(fd.get("password") || "");
  const real = process.env.APP_PASSWORD || "";
  if (!real || !safeEqual(pass, real)) return { error: "Contraseña incorrecta" };

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
  return Number.isFinite(n) ? n : null;
};
const dec = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (v === null) return null;
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

function datosViaje(fd: FormData) {
  const titulo = str(fd, "titulo");
  const fecha_inicio = str(fd, "fecha_inicio");
  if (!titulo || !fecha_inicio) throw new Error("Título y fecha son obligatorios");

  const odometro_inicio = int(fd, "odometro_inicio");
  const odometro_fin = int(fd, "odometro_fin");
  let km = dec(fd, "km");
  if (km === null && odometro_inicio !== null && odometro_fin !== null) {
    km = Math.max(0, odometro_fin - odometro_inicio);
  }

  return {
    titulo,
    fecha_inicio,
    fecha_fin: str(fd, "fecha_fin"),
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
  };
}

function fotosDelForm(fd: FormData): FotoDraft[] {
  try {
    const arr = JSON.parse(String(fd.get("fotos") || "[]"));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((f) => typeof f?.public_id === "string")
      .map((f) => ({ ...f, tipo: f.tipo === "video" ? "video" : "image", duracion: Number(f.duracion) || null }));
  } catch {
    return [];
  }
}

function refrescar(id?: string) {
  revalidatePath("/");
  revalidatePath("/viajes");
  revalidatePath("/motos");
  if (id) revalidatePath(`/viajes/${id}`);
}

/* ───────────── Viajes ───────────── */

export async function crearViaje(fd: FormData) {
  const datos = datosViaje(fd);
  const fotos = fotosDelForm(fd);

  const { data, error } = await db().from("viajes").insert(datos).select("id").single();
  if (error) throw new Error(error.message);

  if (fotos.length) {
    const { error: e2 } = await db()
      .from("fotos")
      .insert(
        fotos.map((f, i) => ({
          viaje_id: data.id,
          tipo: f.tipo,
          public_id: f.public_id,
          width: f.width,
          height: f.height,
          duracion: f.duracion,
          caption: f.caption?.trim() || null,
          orden: i,
        }))
      );
    if (e2) throw new Error(e2.message);
  }

  refrescar(data.id);
  redirect(`/viajes/${data.id}`);
}

export async function actualizarViaje(id: string, fd: FormData) {
  const datos = datosViaje(fd);
  const fotos = fotosDelForm(fd);

  const { data: actual, error: e0 } = await db()
    .from("viajes")
    .select("gpx_public_id, fotos(id, public_id, tipo)")
    .eq("id", id)
    .single();
  if (e0) throw new Error(e0.message);

  const { error } = await db().from("viajes").update(datos).eq("id", id);
  if (error) throw new Error(error.message);

  // GPX reemplazado o quitado → borrar el anterior
  if (actual.gpx_public_id && actual.gpx_public_id !== datos.gpx_public_id) {
    await borrarRaw(actual.gpx_public_id);
  }

  // Fotos: las que ya no vienen en el form se borran (DB + Cloudinary)
  const existentes = (actual.fotos || []) as { id: string; public_id: string; tipo: string }[];
  const idsQuedan = new Set(fotos.filter((f) => f.id).map((f) => f.id));
  const eliminar = existentes.filter((f) => !idsQuedan.has(f.id));
  if (eliminar.length) {
    await db().from("fotos").delete().in("id", eliminar.map((f) => f.id));
    await borrarMedios(eliminar);
  }

  // Upsert con el nuevo orden
  const filas = fotos.map((f, i) => ({
    ...(f.id ? { id: f.id } : {}),
    viaje_id: id,
    tipo: f.tipo,
    public_id: f.public_id,
    width: f.width,
    height: f.height,
    duracion: f.duracion,
    caption: f.caption?.trim() || null,
    orden: i,
  }));
  const nuevas = filas.filter((f) => !("id" in f));
  const viejas = filas.filter((f) => "id" in f);
  if (viejas.length) {
    const { error: e1 } = await db().from("fotos").upsert(viejas);
    if (e1) throw new Error(e1.message);
  }
  if (nuevas.length) {
    const { error: e2 } = await db().from("fotos").insert(nuevas);
    if (e2) throw new Error(e2.message);
  }

  refrescar(id);
  redirect(`/viajes/${id}`);
}

export async function eliminarViaje(id: string) {
  const { data } = await db()
    .from("viajes")
    .select("gpx_public_id, fotos(public_id, tipo)")
    .eq("id", id)
    .single();

  const { error } = await db().from("viajes").delete().eq("id", id);
  if (error) throw new Error(error.message);

  if (data) {
    await borrarMedios((data.fotos || []) as { public_id: string; tipo: string }[]);
    await borrarRaw(data.gpx_public_id);
  }

  refrescar();
  redirect("/viajes");
}

/* ───────────── Motos ───────────── */

export async function crearMoto(fd: FormData) {
  const nombre = str(fd, "nombre");
  if (!nombre) return;
  const { error } = await db()
    .from("motos")
    .insert({
      nombre,
      modelo: str(fd, "modelo"),
      anio: int(fd, "anio"),
      km_iniciales: int(fd, "km_iniciales") ?? 0,
    });
  if (error) throw new Error(error.message);
  refrescar();
}

export async function eliminarMoto(id: string) {
  const { error } = await db().from("motos").delete().eq("id", id);
  if (error) throw new Error(error.message);
  refrescar();
}
