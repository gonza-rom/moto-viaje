const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

export const km = (n: number | null | undefined) => `${nf.format(Number(n || 0))} km`;
export const num = (n: number | null | undefined) => nf.format(Number(n || 0));

export function fecha(d: string | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!d) return "";
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("es-AR", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...opts,
  });
}

export function rangoFechas(inicio: string, fin: string | null) {
  if (!fin || fin === inicio) return fecha(inicio);
  return `${fecha(inicio)} → ${fecha(fin)}`;
}

export function dias(inicio: string, fin: string | null) {
  if (!fin) return 1;
  const ms = new Date(fin).getTime() - new Date(inicio).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}
