// Soporte sin señal (solo navegador):
// - Borrador del formulario en localStorage (texto, ruta, fotos ya subidas…).
// - Fotos/videos elegidos sin señal guardados en IndexedDB hasta poder subirlos.

export type Pendiente = { id: string; borrador: string; file: File; nombre: string; tipo: "image" | "video"; creado: number };

const DB = "moto-viajes";
const STORE = "pendientes";

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore(STORE, { keyPath: "id" });
      s.createIndex("borrador", "borrador");
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}

async function tx<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  return new Promise((ok, mal) => {
    const t = db.transaction(STORE, modo);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => (db.close(), ok(req.result));
    t.onerror = () => (db.close(), mal(t.error));
  });
}

export const guardarPendiente = (p: Pendiente) => tx("readwrite", (s) => s.put(p)).catch(() => undefined);
export const borrarPendiente = (id: string) => tx("readwrite", (s) => s.delete(id)).catch(() => undefined);
export const listarPendientes = (borrador: string) =>
  tx<Pendiente[]>("readonly", (s) => s.index("borrador").getAll(borrador)).catch(() => [] as Pendiente[]);
export async function borrarPendientesDe(borrador: string) {
  for (const p of await listarPendientes(borrador)) await borrarPendiente(p.id);
}

/* ───── Borrador del formulario ───── */

export type Borrador = Record<string, unknown> & { guardado: number };

export function leerBorrador(clave: string): Borrador | null {
  try {
    const v = JSON.parse(localStorage.getItem(clave) || "null");
    return v && typeof v === "object" && typeof v.guardado === "number" ? v : null;
  } catch {
    return null;
  }
}

export function guardarBorrador(clave: string, datos: Record<string, unknown>) {
  try {
    localStorage.setItem(clave, JSON.stringify({ ...datos, guardado: Date.now() }));
  } catch {
    /* sin espacio: no es crítico */
  }
}

export const borrarBorrador = (clave: string) => {
  try {
    localStorage.removeItem(clave);
  } catch {}
};

export function haceCuanto(ms: number) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}
