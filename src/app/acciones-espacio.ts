"use server";

// Espacio en Cloudinary (plan gratis: 25 créditos por mes): uso, fotos sueltas, fotos repetidas
// dentro de un viaje y optimización de fotos ya subidas.

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db, enTandas, traerTodo } from "@/lib/supabase";
import { requerirSesion } from "@/lib/sesion";
import { borrarMedios, cloudinary, CLD_FOLDER, TRANSFORMACION_FOTO } from "@/lib/cloudinary";

const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
/** Fotos más pesadas que esto se pueden optimizar (las optimizadas quedan en ~0,4–1,2 MB) */
const UMBRAL_OPTIMIZAR = 1.5 * 1048576;

type Recurso = { public_id: string; tipo: "image" | "video"; bytes: number; width: number; height: number; creada: string };
type FilaFoto = {
  id: string;
  public_id: string;
  viaje_id: string;
  tipo: string;
  favorita: boolean;
  caption: string | null;
  lugar: string | null;
  categoria: string | null;
  orden: number;
};

export type Suelta = { public_id: string; tipo: "image" | "video"; bytes: number; creada: string };
export type GrupoRepetidas = {
  viaje: string;
  titulo?: string;
  queda: { id: string; public_id: string };
  sobran: { id: string; public_id: string; bytes: number }[];
};
export type Espacio = {
  creditos: { usado: number; limite: number } | null;
  almacenamientoMB: number;
  transformaciones: number;
  transferenciaMB: number;
  sueltas: Suelta[];
  repetidas: GrupoRepetidas[];
  /** Fotos guardadas que se pueden optimizar, y cuánto pesan en total */
  grandes: { ids: string[]; bytes: number };
  error?: string;
};

async function recursos(): Promise<Recurso[]> {
  const out: Recurso[] = [];
  for (const [tipo, carpeta] of [
    ["image", "fotos"],
    ["video", "videos"],
  ] as const) {
    let cursor: string | undefined;
    do {
      const r = await cloudinary.api.resources({
        type: "upload",
        resource_type: tipo,
        prefix: `${CLD_FOLDER}/${carpeta}/`,
        max_results: 500,
        next_cursor: cursor,
      });
      for (const x of r.resources as { public_id: string; bytes: number; width: number; height: number; created_at: string }[])
        out.push({ public_id: x.public_id, tipo, bytes: x.bytes, width: x.width, height: x.height, creada: x.created_at });
      cursor = r.next_cursor;
    } while (cursor);
  }
  return out;
}

const filasFotos = () =>
  traerTodo<FilaFoto>((d, h) =>
    db().from("fotos").select("id, public_id, viaje_id, tipo, favorita, caption, lugar, categoria, orden").order("id").range(d, h)
  );

/** Huella de la imagen: miniatura chica idéntica ⇔ misma imagen */
async function huella(publicId: string) {
  const r = await fetch(`https://res.cloudinary.com/${CLOUD}/image/upload/c_fill,w_48,h_48,f_png/${publicId}`);
  if (!r.ok) return null;
  return createHash("md5").update(Buffer.from(await r.arrayBuffer())).digest("hex");
}

/** Repetidas dentro de un mismo viaje: mismo tamaño de archivo y misma imagen. Queda la que tiene más datos. */
async function buscarRepetidas(rec: Recurso[], fotos: FilaFoto[]): Promise<GrupoRepetidas[]> {
  const porId = new Map(rec.map((r) => [r.public_id, r]));
  const grupos = new Map<string, FilaFoto[]>();
  for (const f of fotos) {
    const r = porId.get(f.public_id);
    if (!r || f.tipo === "video") continue;
    const k = `${f.viaje_id}|${r.bytes}|${r.width}x${r.height}`;
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  const puntaje = (f: FilaFoto) => (f.favorita ? 8 : 0) + (f.caption ? 4 : 0) + (f.lugar ? 2 : 0) + (f.categoria ? 1 : 0);
  const out: GrupoRepetidas[] = [];
  for (const lista of grupos.values()) {
    if (lista.length < 2) continue;
    const hs = await Promise.all(lista.map((f) => huella(f.public_id)));
    const porHuella = new Map<string, FilaFoto[]>();
    lista.forEach((f, i) => {
      const h = hs[i];
      if (h) porHuella.set(h, [...(porHuella.get(h) ?? []), f]);
    });
    for (const iguales of porHuella.values()) {
      if (iguales.length < 2) continue;
      const orden = [...iguales].sort((a, b) => puntaje(b) - puntaje(a) || a.orden - b.orden);
      out.push({
        viaje: orden[0].viaje_id,
        queda: { id: orden[0].id, public_id: orden[0].public_id },
        sobran: orden.slice(1).map((f) => ({ id: f.id, public_id: f.public_id, bytes: porId.get(f.public_id)?.bytes ?? 0 })),
      });
    }
  }
  return out;
}

async function conTitulos(gs: GrupoRepetidas[]) {
  if (!gs.length) return gs;
  const { data } = await db().from("viajes").select("id, titulo");
  const t = new Map((data ?? []).map((v) => [v.id as string, v.titulo as string]));
  return gs.map((g) => ({ ...g, titulo: t.get(g.viaje) }));
}

export async function revisarEspacio(): Promise<Espacio> {
  await requerirSesion();
  const vacio: Espacio = {
    creditos: null,
    almacenamientoMB: 0,
    transformaciones: 0,
    transferenciaMB: 0,
    sueltas: [],
    repetidas: [],
    grandes: { ids: [], bytes: 0 },
  };
  try {
    const [uso, rec, fotos] = await Promise.all([cloudinary.api.usage(), recursos(), filasFotos()]);
    const usadas = new Set(fotos.map((f) => f.public_id));
    const hace1dia = Date.now() - 24 * 3600 * 1000;
    const sueltas = rec
      .filter((r) => !usadas.has(r.public_id) && Date.parse(r.creada) < hace1dia)
      .map((r) => ({ public_id: r.public_id, tipo: r.tipo, bytes: r.bytes, creada: r.creada }))
      .sort((a, b) => a.creada.localeCompare(b.creada));
    const grandes = rec.filter((r) => r.tipo === "image" && usadas.has(r.public_id) && r.bytes > UMBRAL_OPTIMIZAR);
    const u = uso as {
      credits?: { usage: number; limit: number };
      storage?: { usage: number };
      transformations?: { usage: number };
      bandwidth?: { usage: number };
    };
    return {
      creditos: u.credits ? { usado: Math.round(u.credits.usage * 100) / 100, limite: u.credits.limit } : null,
      almacenamientoMB: Math.round((u.storage?.usage ?? 0) / 1048576),
      transformaciones: u.transformations?.usage ?? 0,
      transferenciaMB: Math.round((u.bandwidth?.usage ?? 0) / 1048576),
      sueltas,
      repetidas: await conTitulos(await buscarRepetidas(rec, fotos)),
      grandes: { ids: grandes.map((g) => g.public_id), bytes: grandes.reduce((a, g) => a + g.bytes, 0) },
    };
  } catch (e) {
    return { ...vacio, error: (e as Error).message || "No se pudo consultar Cloudinary" };
  }
}

/** Borra de Cloudinary las fotos sueltas elegidas (vuelve a verificar que no estén en ningún viaje) */
export async function borrarSueltas(ids: string[]): Promise<{ borradas: number; error?: string }> {
  await requerirSesion();
  try {
    const pedidas = new Set((Array.isArray(ids) ? ids : []).filter((x) => typeof x === "string"));
    const usadas = new Set((await filasFotos()).map((f) => f.public_id));
    const rec = (await recursos()).filter((r) => pedidas.has(r.public_id) && !usadas.has(r.public_id));
    await borrarMedios(rec.map((r) => ({ public_id: r.public_id, tipo: r.tipo })));
    return { borradas: rec.length };
  } catch (e) {
    return { borradas: 0, error: (e as Error).message };
  }
}

/** Saca las fotos repetidas elegidas de sus viajes (y de Cloudinary). Recalcula para no borrar de más. */
export async function borrarRepetidas(fotoIds: string[]): Promise<{ borradas: number; error?: string }> {
  await requerirSesion();
  try {
    const pedidas = new Set((Array.isArray(fotoIds) ? fotoIds : []).filter((x) => typeof x === "string"));
    const [rec, fotos] = await Promise.all([recursos(), filasFotos()]);
    const sobran = (await buscarRepetidas(rec, fotos)).flatMap((g) => g.sobran).filter((s) => pedidas.has(s.id));
    if (!sobran.length) return { borradas: 0 };
    const { error } = await enTandas(
      sobran.map((s) => s.id),
      (lote) => db().from("fotos").delete().in("id", lote)
    );
    if (error) throw new Error(error.message);
    // El archivo se borra solo si ninguna otra fila lo usa
    const quedan = new Set((await filasFotos()).map((f) => f.public_id));
    await borrarMedios(sobran.filter((s) => !quedan.has(s.public_id)).map((s) => ({ public_id: s.public_id, tipo: "image" })));
    revalidatePath("/fotos");
    return { borradas: sobran.length };
  } catch (e) {
    return { borradas: 0, error: (e as Error).message };
  }
}

/**
 * Reemplaza fotos ya subidas por su versión optimizada (hasta 3072 px, calidad buena).
 * Procesa pocas por llamada (el cliente la llama en tandas). Devuelve cuánto se ahorró.
 */
export async function optimizarFotos(publicIds: string[]): Promise<{ hechas: number; ahorro: number; errores: number }> {
  await requerirSesion();
  const ids = (Array.isArray(publicIds) ? publicIds : []).filter((x) => typeof x === "string" && x.startsWith(`${CLD_FOLDER}/fotos/`)).slice(0, 4);
  let hechas = 0;
  let ahorro = 0;
  let errores = 0;
  for (const id of ids) {
    try {
      // Solo fotos que están en un viaje y todavía pesadas
      const { data: fila } = await db().from("fotos").select("id").eq("public_id", id).limit(1);
      if (!fila?.length) continue;
      const antes = (await cloudinary.api.resource(id, { resource_type: "image" })) as { bytes: number };
      if (antes.bytes <= UMBRAL_OPTIMIZAR) continue;
      // Cloudinary no deja que se descargue a sí mismo (responde 420): la versión optimizada la baja el
      // servidor y la sube encima del original, con el mismo public_id
      const r = await fetch(`https://res.cloudinary.com/${CLOUD}/image/upload/${TRANSFORMACION_FOTO},f_jpg/${id}`);
      if (!r.ok) throw new Error(`No se pudo generar la versión optimizada (${r.status})`);
      const datos = `data:image/jpeg;base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
      const nueva = await cloudinary.uploader.upload(datos, {
        public_id: id,
        overwrite: true,
        invalidate: true,
        resource_type: "image",
      });
      if (nueva.bytes >= antes.bytes) continue;
      await db().from("fotos").update({ width: nueva.width, height: nueva.height }).eq("public_id", id);
      hechas++;
      ahorro += antes.bytes - nueva.bytes;
    } catch {
      errores++;
    }
  }
  return { hechas, ahorro, errores };
}
