// Categorías de fotos (las mismas que acepta la base: ver supabase/migracion-2026-11-05.sql)

export const CATEGORIAS = [
  { valor: "paisaje", label: "Paisaje" },
  { valor: "ruta", label: "Ruta" },
  { valor: "moto", label: "La moto" },
  { valor: "gente", label: "Gente" },
  { valor: "comida", label: "Comida" },
  { valor: "alojamiento", label: "Alojamiento" },
  { valor: "pueblos", label: "Pueblos" },
  { valor: "otro", label: "Otro" },
] as const;

export type Categoria = (typeof CATEGORIAS)[number]["valor"];

export const esCategoria = (v: unknown): v is Categoria => CATEGORIAS.some((c) => c.valor === v);

export const nombreCategoria = (v: string | null | undefined) => CATEGORIAS.find((c) => c.valor === v)?.label ?? "";

/** "Fiambalá, Catamarca" (o solo lo que haya) */
export const textoLugar = (f: { lugar?: string | null; provincia?: string | null }) =>
  [f.lugar, f.provincia && f.provincia !== f.lugar ? f.provincia : null].filter(Boolean).join(", ");
