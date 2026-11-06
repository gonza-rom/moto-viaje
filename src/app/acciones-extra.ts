"use server";

// Server actions de gastos, mantenimiento, compartir y altimetría.
// Cada una llama a requerirSesion(): las actions se pueden invocar desde páginas públicas.

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { limpiarNombreLugar, parseRuta } from "@/lib/ruta";
import { requerirSesion } from "@/lib/sesion";
import { TIPOS_GASTO } from "@/lib/gastos";
import { TIPOS_MANT } from "@/lib/mantenimiento";
import type { Altimetria, Gasto, LugarRecorrido, Mantenimiento } from "@/lib/types";
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

/*
 * Estas actions se usan sin salir de la página (gastos, mantenimiento, compartir) y NO revalidan la
 * página actual: revalidar la misma página desde una action deja la transición sin terminar y la
 * vista no se actualiza. Cada panel agrega/quita el ítem en su propia lista, y como todas las páginas
 * son dinámicas, al navegar se traen datos frescos.
 */

/* ───────────── Gastos ───────────── */

/** Devuelve el gasto creado: el panel lo agrega a su lista sin esperar a que se refresque la página */
export async function crearGasto(_prev: Estado, fd: FormData): Promise<Estado & { gasto?: Gasto }> {
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
    const { data, error } = await db()
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
      })
      .select("*")
      .single();
    if (error) throw error;
    return { ok: "Gasto guardado", gasto: { ...data, monto: Number(data.monto), litros: data.litros === null ? null : Number(data.litros) } as Gasto };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function eliminarGasto(id: string) {
  await requerirSesion();
  const { data } = await db().from("gastos").delete().eq("id", id).select("viaje_id").maybeSingle();
}

/* ───────────── Mantenimiento ───────────── */

export async function crearMantenimiento(_prev: Estado, fd: FormData): Promise<Estado & { mant?: Mantenimiento }> {
  await requerirSesion();
  try {
    const moto_id = uuid(fd, "moto_id");
    if (!moto_id) throw new Error("Falta la moto");
    const tipo = txt(fd, "tipo") ?? "otro";
    if (!TIPOS_MANT.some((t) => t.valor === tipo)) throw new Error("Tipo inválido");
    const odo = num(fd, "odometro");
    const cadaKm = num(fd, "cada_km");
    const cadaMeses = num(fd, "cada_meses");
    const { data, error } = await db()
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
      })
      .select("*")
      .single();
    if (error) throw error;
    return { ok: "Mantenimiento registrado", mant: { ...data, costo: data.costo === null ? null : Number(data.costo) } as Mantenimiento };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function eliminarMantenimiento(id: string) {
  await requerirSesion();
  await db().from("mantenimientos").delete().eq("id", id);
}

/* ───────────── Compartir ───────────── */

/** Activa (genera link nuevo) o desactiva el link público de un viaje */
export async function compartirViaje(id: string, activar: boolean): Promise<{ token: string | null; error?: string }> {
  await requerirSesion();
  if (!UUID.test(id)) return { token: null, error: "Viaje inválido" };
  const token = activar ? randomBytes(18).toString("base64url") : null;
  const { error } = await db().from("viajes").update({ compartir_token: token }).eq("id", id);
  if (error) return { token: null, error: error.message };
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

/* ───────────── Lugares de las fotos ───────────── */

type Direccion = Record<string, string>;
const lugarDeDireccion = (a: Direccion = {}) => ({
  lugar: limpiarNombreLugar(a.city || a.town || a.village || a.hamlet || a.municipality || a.county || a.state_district) ?? "",
  provincia: a.state || a.province || a.region || null,
  pais: a.country || null,
});

/**
 * Detecta la localidad / provincia / país de las fotos con GPS que todavía no lo tienen.
 * Procesa pocas por llamada (Nominatim pide máx. 1 pedido por segundo y la función tiene
 * tiempo limitado): el cliente la llama en bucle mientras queden pendientes.
 * Reusa el lugar de fotos cercanas (~1 km) para no repetir pedidos.
 */
export async function detectarLugares(): Promise<{ hechas: number; pendientes: number; error?: string }> {
  await requerirSesion();
  const LOTE = 6;
  const { data: fotos, error } = await db()
    .from("fotos")
    .select("id, lat, lng")
    .not("lat", "is", null)
    .not("lng", "is", null)
    .is("lugar", null)
    .order("tomada_en", { ascending: true, nullsFirst: false })
    .limit(LOTE);
  if (error) return { hechas: 0, pendientes: 0, error: error.message };

  const cache = new Map<string, ReturnType<typeof lugarDeDireccion>>();
  const clave = (lat: number, lng: number) => `${lat.toFixed(2)},${lng.toFixed(2)}`;
  let hechas = 0;
  let pedidos = 0;
  let errorRed: string | undefined;

  for (const f of (fotos ?? []) as { id: string; lat: number; lng: number }[]) {
    const k = clave(f.lat, f.lng);
    let res = cache.get(k);

    if (!res) {
      // ¿Otra foto ya detectada a menos de ~1 km?
      const d = 0.01;
      const { data: cerca } = await db()
        .from("fotos")
        .select("lugar, provincia, pais")
        .gte("lat", f.lat - d)
        .lte("lat", f.lat + d)
        .gte("lng", f.lng - d)
        .lte("lng", f.lng + d)
        .not("lugar", "is", null)
        .neq("lugar", "")
        .limit(1);
      if (cerca?.[0]) res = { lugar: cerca[0].lugar, provincia: cerca[0].provincia, pais: cerca[0].pais };
    }

    if (!res) {
      if (pedidos > 0) await new Promise((ok) => setTimeout(ok, 1100));
      pedidos++;
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&accept-language=es&lat=${f.lat}&lon=${f.lng}`,
          { headers: { "User-Agent": "moto-viajes/1.0 (diario personal de viajes)" }, signal: AbortSignal.timeout(8000) }
        );
        if (!r.ok) throw new Error(`OpenStreetMap respondió ${r.status}`);
        const j = (await r.json()) as { address?: Direccion };
        res = lugarDeDireccion(j.address);
      } catch (e) {
        errorRed = (e as Error).message || "Sin conexión con OpenStreetMap";
        break;
      }
    }

    cache.set(k, res);
    const { error: eu } = await db().from("fotos").update(res).eq("id", f.id);
    if (!eu) hechas++;
  }

  const { count } = await db()
    .from("fotos")
    .select("id", { count: "exact", head: true })
    .not("lat", "is", null)
    .not("lng", "is", null)
    .is("lugar", null);
  if (hechas) revalidatePath("/estadisticas");
  return { hechas, pendientes: count ?? 0, ...(errorRed && !hechas ? { error: errorRed } : {}) };
}

/**
 * Lugar puesto a mano (para fotos sin GPS: el celular lo borra al subir desde la galería).
 * "Tafí del Valle" o "Tafí del Valle, Tucumán". Completa provincia y país reusando fotos con el
 * mismo lugar o buscándolo en OpenStreetMap. Texto vacío = quitar el lugar.
 */
export async function ponerLugar(
  ids: string[],
  texto: string
): Promise<{ lugar: string | null; provincia: string | null; pais: string | null; error?: string }> {
  await requerirSesion();
  const validos = (Array.isArray(ids) ? ids : []).filter((x) => typeof x === "string" && UUID.test(x)).slice(0, 500);
  const vacio = { lugar: null, provincia: null, pais: null };
  if (!validos.length) return { ...vacio, error: "No hay fotos" };

  const limpio = String(texto ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!limpio) {
    const { error } = await db().from("fotos").update(vacio).in("id", validos);
    return error ? { ...vacio, error: error.message } : vacio;
  }

  const [lugar, ...resto] = limpio.split(",").map((s) => s.trim()).filter(Boolean);
  let provincia: string | null = resto[0] ?? null;
  let pais: string | null = resto[1] ?? null;

  // ¿Ya hay fotos en ese lugar con provincia? (sin pedidos externos)
  if (!provincia) {
    const { data } = await db().from("fotos").select("provincia, pais").ilike("lugar", lugar).not("provincia", "is", null).limit(1);
    if (data?.[0]) ({ provincia, pais } = data[0]);
  }
  if (!provincia || !pais) {
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=es&q=${encodeURIComponent(limpio)}`,
        { headers: { "User-Agent": "moto-viajes/1.0 (diario personal de viajes)" }, signal: AbortSignal.timeout(6000) }
      );
      if (r.ok) {
        const [res] = (await r.json()) as { address?: Direccion }[];
        const l = lugarDeDireccion(res?.address);
        provincia ??= l.provincia;
        pais ??= l.pais;
      }
    } catch {
      // sin conexión con OpenStreetMap: se guarda solo el nombre
    }
  }

  const fila = { lugar, provincia, pais };
  const { error } = await db().from("fotos").update(fila).in("id", validos);
  if (error) return { ...vacio, error: error.message };
  revalidatePath("/estadisticas");
  return fila;
}

/* ───────────── Localidades del recorrido ───────────── */

/** Guarda las localidades por las que pasa el recorrido (calculadas en el navegador) */
export async function guardarLugaresRecorrido(id: string, lugares: LugarRecorrido[]) {
  await requerirSesion();
  if (!UUID.test(id) || !Array.isArray(lugares) || lugares.length > 300) return { error: "Datos inválidos" };
  const t = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim().slice(0, 120) : undefined);
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const limpios = lugares
    .map((l) => ({ nombre: t(l?.nombre), provincia: t(l?.provincia), pais: t(l?.pais), km: n(l?.km), lat: n(l?.lat), lng: n(l?.lng), propio: l?.propio === true || undefined }))
    .filter((l) => l.nombre && l.km !== null && l.lat !== null && l.lng !== null && Math.abs(l.lat!) <= 90 && Math.abs(l.lng!) <= 180)
    .map((l) => ({ ...l, km: Math.round(l.km! * 10) / 10 }))
    .sort((a, b) => a.km - b.km);
  const { error } = await db().from("viajes").update({ lugares: limpios }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/estadisticas");
  return { ok: true };
}

/* ───────────── Planes (planificador) ───────────── */

type DatosPlan = {
  nombre: string;
  ruta: unknown;
  consumo: number | null;
  tanque: number | null;
  precio: number | null;
  reserva: number;
  litros: number | null;
  costo: number | null;
};

/** Guarda (o actualiza, si viene id) una ruta planificada */
export async function guardarPlan(id: string | null, d: DatosPlan): Promise<{ id?: string; error?: string }> {
  await requerirSesion();
  const ruta = parseRuta(d?.ruta);
  if (!ruta) return { error: "La ruta no es válida" };
  const nombre = String(d?.nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!nombre) return { error: "Poné un nombre para el plan" };
  const n = (x: unknown, max: number) => (typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= max ? x : null);
  const fila = {
    nombre,
    ruta,
    km: ruta.km,
    consumo: n(d.consumo, 200),
    tanque: n(d.tanque, 100),
    precio: n(d.precio, 1e7),
    reserva: Math.round(n(d.reserva, 50) ?? 15),
    litros: n(d.litros, 1e5),
    costo: n(d.costo, 1e10),
  };
  if (id) {
    if (!UUID.test(id)) return { error: "Plan inválido" };
    const { error } = await db().from("planes").update(fila).eq("id", id);
    return error ? { error: error.message } : { id };
  }
  const { data, error } = await db().from("planes").insert(fila).select("id").single();
  return error ? { error: error.message } : { id: data.id };
}

export async function borrarPlan(id: string) {
  await requerirSesion();
  if (UUID.test(id)) await db().from("planes").delete().eq("id", id);
}

/* ───────────── Álbum compartido ───────────── */

/** Activa (token nuevo) o desactiva el link para que otros suban fotos al viaje */
export async function albumViaje(id: string, activar: boolean): Promise<{ token: string | null; error?: string }> {
  await requerirSesion();
  if (!UUID.test(id)) return { token: null, error: "Viaje inválido" };
  const token = activar ? randomBytes(18).toString("base64url") : null;
  const { error } = await db().from("viajes").update({ album_token: token }).eq("id", id);
  if (error) return { token: null, error: error.message };
  return { token };
}
