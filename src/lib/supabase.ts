import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/**
 * Corre una operación con una lista de IDs en tandas: la base rechaza pedidos con más de ~600 IDs
 * (la lista va en la URL). Devuelve el primer error, si hubo.
 */
export async function enTandas<T>(
  ids: T[],
  fn: (lote: T[]) => PromiseLike<{ error: { message: string } | null }>,
  tam = 200
): Promise<{ error: { message: string } | null }> {
  for (let i = 0; i < ids.length; i += tam) {
    const { error } = await fn(ids.slice(i, i + tam));
    if (error) return { error };
  }
  return { error: null };
}

/** Trae todas las filas de a 1000 (la base devuelve como máximo 1000 por pedido) */
export async function traerTodo<T>(pedir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await pedir(desde, desde + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}
