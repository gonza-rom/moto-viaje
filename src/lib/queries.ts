import "server-only";
import { db, traerTodo } from "./supabase";
import type { FotoConViaje, Gasto, Jornada, Mantenimiento, Moto, Plan, ViajeConRelaciones } from "./types";

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
  // De a 1000: la base no devuelve más de 1000 filas por pedido
  const data = await traerTodo<FotoConViaje>((desde, hasta) =>
    db().from("fotos").select("*, viajes(id, titulo, fecha_inicio, fecha_fin, moto_id)").order("id").range(desde, hasta)
  );
  return data.sort(
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

/** Gastos: de un viaje, de una moto, o todos (más nuevos primero) */
export async function getGastos(f: { viajeId?: string; jornadaId?: string } = {}): Promise<Gasto[]> {
  let q = db().from("gastos").select("*").order("fecha", { ascending: false }).order("created_at", { ascending: false });
  if (f.viajeId) q = q.eq("viaje_id", f.viajeId);
  if (f.jornadaId) q = q.eq("jornada_id", f.jornadaId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as Gasto[]).map((g) => ({ ...g, monto: Number(g.monto), litros: g.litros === null ? null : Number(g.litros) }));
}

export async function getMantenimientos(): Promise<Mantenimiento[]> {
  const { data, error } = await db().from("mantenimientos").select("*").order("fecha", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Mantenimiento[]).map((m) => ({ ...m, costo: m.costo === null ? null : Number(m.costo) }));
}

/** Viaje público por token (link compartido). Sin datos privados. */
export async function getViajeCompartido(token: string): Promise<ViajeConRelaciones | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const { data, error } = await db().from("viajes").select(SELECT_VIAJE).eq("compartir_token", token).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const v = ordenarFotos(data as ViajeConRelaciones);
  // Nada de notas, diario ni odómetro en la vista pública
  // ni el token del álbum (permite subir fotos), ni quién subió cada foto
  return {
    ...v,
    notas: null,
    diario: null,
    odometro_inicio: null,
    odometro_fin: null,
    album_token: null,
    fotos: v.fotos.map((f) => ({ ...f, subida_por: null })),
  };
}

export async function getPlanes(): Promise<Plan[]> {
  const { data, error } = await db().from("planes").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Plan[]).map((p) => ({
    ...p,
    km: Number(p.km),
    consumo: p.consumo === null ? null : Number(p.consumo),
    tanque: p.tanque === null ? null : Number(p.tanque),
    precio: p.precio === null ? null : Number(p.precio),
    litros: p.litros === null ? null : Number(p.litros),
    costo: p.costo === null ? null : Number(p.costo),
  }));
}

/** Viaje por token del álbum compartido (solo lo necesario para la página de subida) */
export async function getViajeAlbum(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const { data, error } = await db()
    .from("viajes")
    .select("id, titulo, fecha_inicio, fecha_fin, fotos(count)")
    .eq("album_token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const n = (data.fotos as unknown as { count: number }[])?.[0]?.count ?? 0;
  return { id: data.id as string, titulo: data.titulo as string, fecha_inicio: data.fecha_inicio as string, fecha_fin: data.fecha_fin as string | null, nFotos: n };
}

/** Plan del planificador con el que se hizo un viaje (si hay) */
export async function getPlanDeViaje(viajeId: string): Promise<Plan | null> {
  const { data, error } = await db().from("planes").select("*").eq("viaje_id", viajeId).order("created_at", { ascending: false }).limit(1);
  if (error || !data?.[0]) return null;
  const p = data[0] as Plan;
  return { ...p, km: Number(p.km), litros: p.litros === null ? null : Number(p.litros), costo: p.costo === null ? null : Number(p.costo) };
}

const numJornada = (j: Jornada): Jornada => ({
  ...j,
  km: Number(j.km),
  ingresos: j.ingresos === null ? null : Number(j.ingresos),
  propinas: j.propinas === null ? null : Number(j.propinas),
});

/** Jornadas de trabajo, la más nueva primero. sinRecorrido: no trae los puntos (listados) */
export async function getJornadas(o: { sinRecorrido?: boolean } = {}): Promise<Jornada[]> {
  const cols = o.sinRecorrido
    ? "id, moto_id, fecha, inicio, fin, km, minutos_total, minutos_movimiento, ingresos, propinas, viajes, notas, created_at"
    : "*";
  const { data, error } = await db().from("jornadas").select(cols).order("fecha", { ascending: false }).order("inicio", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as unknown as Jornada[]).map((j) => numJornada({ ...j, recorrido: j.recorrido ?? null }));
}

export async function getJornada(id: string): Promise<Jornada | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await db().from("jornadas").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? numJornada(data as Jornada) : null;
}
