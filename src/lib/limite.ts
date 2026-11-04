import "server-only";
import { db } from "./supabase";

/**
 * Límite de intentos de login fallidos.
 * - Por IP: 5 fallos en 15 min → esa IP espera.
 * - Global: 30 fallos en 15 min → se bloquean todos los logins (frena ataques que rotan IPs;
 *   vos seguís entrando porque la sesión dura 90 días).
 * Se guarda en Supabase (tabla login_intentos) porque en Vercel cada request puede caer en otra instancia.
 * Si la tabla no existe todavía, usa memoria como respaldo.
 */
const VENTANA_MS = 15 * 60 * 1000;
const MAX_IP = 5;
const MAX_GLOBAL = 30;

const memoria: { ip: string; t: number }[] = [];
let sinTabla = false;

function limpiarMemoria() {
  const corte = Date.now() - VENTANA_MS;
  while (memoria.length && memoria[0].t < corte) memoria.shift();
}

/** Devuelve los minutos que faltan si está bloqueado, o null si puede intentar */
export async function minutosBloqueo(ip: string): Promise<number | null> {
  const desde = new Date(Date.now() - VENTANA_MS).toISOString();
  let fallos: { ip: string; t: number }[];

  if (!sinTabla) {
    const { data, error } = await db()
      .from("login_intentos")
      .select("ip, creado")
      .gte("creado", desde)
      .order("creado", { ascending: true })
      .limit(MAX_GLOBAL + 1);
    if (error) {
      sinTabla = true;
      console.warn("login_intentos no disponible, uso memoria:", error.message);
    } else {
      fallos = data.map((r) => ({ ip: r.ip, t: new Date(r.creado).getTime() }));
    }
  }
  if (sinTabla) {
    limpiarMemoria();
    fallos = memoria;
  }

  const deIp = fallos!.filter((f) => f.ip === ip);
  const lista = fallos!.length >= MAX_GLOBAL ? fallos! : deIp.length >= MAX_IP ? deIp : null;
  if (!lista) return null;
  const libera = lista[0].t + VENTANA_MS;
  return Math.max(1, Math.ceil((libera - Date.now()) / 60000));
}

export async function registrarFallo(ip: string) {
  if (!sinTabla) {
    const { error } = await db().from("login_intentos").insert({ ip });
    if (!error) return;
    sinTabla = true;
  }
  memoria.push({ ip, t: Date.now() });
}

export async function limpiarFallos(ip: string) {
  if (!sinTabla) await db().from("login_intentos").delete().eq("ip", ip);
  for (let i = memoria.length - 1; i >= 0; i--) if (memoria[i].ip === ip) memoria.splice(i, 1);
}
