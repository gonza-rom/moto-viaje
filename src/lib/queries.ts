import "server-only";
import { db } from "./supabase";
import type { FotoConViaje, Moto, ViajeConRelaciones } from "./types";

const SELECT_VIAJE = "*, motos(id, nombre), fotos(*)";

function ordenarFotos(v: ViajeConRelaciones): ViajeConRelaciones {
  return { ...v, km: Number(v.km), fotos: [...(v.fotos || [])].sort((a, b) => a.orden - b.orden) };
}

export async function getViajes(): Promise<ViajeConRelaciones[]> {
  const { data, error } = await db()
    .from("viajes")
    .select(SELECT_VIAJE)
    .order("fecha_inicio", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as ViajeConRelaciones[]).map(ordenarFotos);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getViaje(id: string): Promise<ViajeConRelaciones | null> {
  if (!UUID.test(id)) return null; // URL inválida → 404 en vez de error de la base
  const { data, error } = await db().from("viajes").select(SELECT_VIAJE).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? ordenarFotos(data as ViajeConRelaciones) : null;
}

/** Todas las fotos y videos con su viaje: del viaje más nuevo al más viejo, y en el orden elegido */
export async function getFotos(): Promise<FotoConViaje[]> {
  const { data, error } = await db()
    .from("fotos")
    .select("*, viajes(id, titulo, fecha_inicio, fecha_fin, moto_id)")
    .limit(5000);
  if (error) throw new Error(error.message);
  return (data as FotoConViaje[]).sort(
    (a, b) =>
      (b.viajes?.fecha_inicio ?? "").localeCompare(a.viajes?.fecha_inicio ?? "") ||
      (a.viaje_id < b.viaje_id ? -1 : a.viaje_id > b.viaje_id ? 1 : 0) ||
      a.orden - b.orden
  );
}

export async function getMotos(): Promise<Moto[]> {
  const { data, error } = await db().from("motos").select("*").order("created_at");
  if (error) throw new Error(error.message);
  return data as Moto[];
}
