"use server";

// Server actions de gastos, mantenimiento, compartir y altimetría.
// Cada una llama a requerirSesion(): las actions se pueden invocar desde páginas públicas.

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { requerirSesion } from "@/lib/sesion";
import { TIPOS_GASTO } from "@/lib/gastos";
import { TIPOS_MANT } from "@/lib/mantenimiento";
import type { Altimetria } from "@/lib/types";
import type { Estado } from "./actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const txt = (fd: FormData, k: string, max = 300) => {
  const v = String(fd.get(k) ?? "").trim();
  return v ? v.slice(0, max) : null;
};
const num = (fd: FormData, k: string) => {
  const v = txt(fd, k);
  if (v === null) return null;
  const n = parseFloat(v.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw new Error(`"${v}" no es un número válido`);
  return n;
};
const fecha = (fd: FormData, k: string) => {
  const v = txt(fd, k);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Date().toISOString().slice(0, 10);
};
const uuid = (fd: FormData, k: string) => {
  const v = txt(fd, k);
  return v && UUID.test(v) ? v : null;
};

function refrescar(viajeId?: string | null) {
  revalidatePath("/");
  revalidatePath("/motos");
  revalidatePath("/estadisticas");
  if (viajeId) revalidatePath(`/viajes/${viajeId}`);
}

/* ───────────── Gastos ───────────── */

export async function crearGasto(_prev: Estado, fd: FormData): Promise<Estado> {
  await requerirSesion();
  try {
    const tipo = txt(fd, "tipo") ?? "nafta";
    if (!TIPOS_GASTO.some((t) => t.valor === tipo)) throw new Error("Tipo de gasto inválido");
    const monto = num(fd, "monto");
    const litros = tipo === "nafta" ? num(fd, "litros") : null;
    if (monto === null && litros === null) throw new Error("Poné el monto (o los litros, si es nafta)");
    const viaje_id = uuid(fd, "viaje_id");
    let moto_id = uuid(fd, "moto_id");
    // Si es de un viaje y no se eligió moto, usar la del viaje
    if (viaje_id && !moto_id) {
      const { data } = await db().from("viajes").select("moto_id").eq("id", viaje_id).single();
      moto_id = data?.moto_id ?? null;
    }
    const odo = num(fd, "odometro");
    const { error } = await db()
      .from("gastos")
      .insert({
        viaje_id,
        moto_id,
        fecha: fecha(fd, "fecha"),
        tipo,
        monto: monto ?? 0,
        litros,
        odometro: odo === null ? null : Math.round(odo),
        lleno: fd.get("lleno") === "on",
        lugar: txt(fd, "lugar", 120),
        notas: txt(fd, "notas", 500),
      });
    if (error) throw error;
    refrescar(viaje_id);
    return { ok: "Gasto guardado" };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function eliminarGasto(id: string) {
  await requerirSesion();
  const { data } = await db().from("gastos").delete().eq("id", id).select("viaje_id").maybeSingle();
  refrescar(data?.viaje_id);
}

/* ───────────── Mantenimiento ───────────── */

export async function crearMantenimiento(_prev: Estado, fd: FormData): Promise<Estado> {
  await requerirSesion();
  try {
    const moto_id = uuid(fd, "moto_id");
    if (!moto_id) throw new Error("Falta la moto");
    const tipo = txt(fd, "tipo") ?? "otro";
    if (!TIPOS_MANT.some((t) => t.valor === tipo)) throw new Error("Tipo inválido");
    const odo = num(fd, "odometro");
    const cadaKm = num(fd, "cada_km");
    const cadaMeses = num(fd, "cada_meses");
    const { error } = await db()
      .from("mantenimientos")
      .insert({
        moto_id,
        tipo,
        fecha: fecha(fd, "fecha"),
        odometro: odo === null ? null : Math.round(odo),
        costo: num(fd, "costo"),
        cada_km: cadaKm === null ? null : Math.round(cadaKm),
        cada_meses: cadaMeses === null ? null : Math.round(cadaMeses),
        notas: txt(fd, "notas", 500),
      });
    if (error) throw error;
    refrescar();
    return { ok: "Mantenimiento registrado" };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function eliminarMantenimiento(id: string) {
  await requerirSesion();
  await db().from("mantenimientos").delete().eq("id", id);
  refrescar();
}

/* ───────────── Compartir ───────────── */

/** Activa (genera link nuevo) o desactiva el link público de un viaje */
export async function compartirViaje(id: string, activar: boolean): Promise<{ token: string | null; error?: string }> {
  await requerirSesion();
  if (!UUID.test(id)) return { token: null, error: "Viaje inválido" };
  const token = activar ? randomBytes(18).toString("base64url") : null;
  const { error } = await db().from("viajes").update({ compartir_token: token }).eq("id", id);
  if (error) return { token: null, error: error.message };
  revalidatePath(`/viajes/${id}`);
  return { token };
}

/* ───────────── Altimetría ───────────── */

/** Guarda el perfil de altura calculado en el navegador (una sola vez por viaje) */
export async function guardarAltimetria(id: string, a: Altimetria) {
  await requerirSesion();
  if (!UUID.test(id) || !Array.isArray(a?.puntos) || a.puntos.length > 1000) return;
  const ok = (n: unknown) => typeof n === "number" && Number.isFinite(n);
  const puntos = a.puntos.filter((p) => Array.isArray(p) && ok(p[0]) && ok(p[1])).map(([d, h]) => [Math.round(d * 100) / 100, Math.round(h)]);
  if (puntos.length < 2) return;
  await db()
    .from("viajes")
    .update({
      altimetria: {
        puntos,
        max: Math.round(a.max),
        min: Math.round(a.min),
        subida: Math.round(a.subida),
        bajada: Math.round(a.bajada),
      },
    })
    .eq("id", id);
  revalidatePath("/estadisticas");
}
