import "server-only";
import { db } from "./supabase";
import type { Moto, ViajeConRelaciones } from "./types";

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

export async function getMotos(): Promise<Moto[]> {
  const { data, error } = await db().from("motos").select("*").order("created_at");
  if (error) throw new Error(error.message);
  return data as Moto[];
}
