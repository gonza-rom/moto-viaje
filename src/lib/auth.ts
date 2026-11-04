// Compatible con Edge (middleware) y Node: usa Web Crypto.
export const SESSION_COOKIE = "mv_session";

async function hmac(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Token de sesión derivado de la contraseña: si cambiás APP_PASSWORD, se cierran todas las sesiones. */
export async function sessionToken(): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  const pass = process.env.APP_PASSWORD;
  if (!secret || !pass) throw new Error("Faltan AUTH_SECRET o APP_PASSWORD");
  return hmac(secret, `moto-viajes:v1:${pass}`);
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function isValidSession(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  return safeEqual(value, await sessionToken());
}
