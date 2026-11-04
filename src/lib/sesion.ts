import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, isValidSession } from "./auth";

/**
 * Corta la ejecución si no hay sesión válida.
 *
 * IMPORTANTE: el middleware no alcanza para proteger las server actions. Una action se puede
 * invocar con un POST a CUALQUIER página, incluidas las públicas (/login, /c/…), así que cada
 * action que lee o modifica datos tiene que llamar a esto primero.
 */
export async function requerirSesion() {
  const ok = await isValidSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!ok) throw new Error("No autorizado");
}
