import Link from "next/link";
import { Plus, Search, SearchX, Tag, X } from "lucide-react";
import { getMotos, getViajes } from "@/lib/queries";
import { ViajeCard } from "@/components/ViajeCard";
import { km } from "@/lib/format";

export const metadata = { title: "Viajes" };

export default async function ViajesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; anio?: string; moto?: string; etiqueta?: string }>;
}) {
  const { q = "", anio = "", moto = "", etiqueta = "" } = await searchParams;
  const [todos, motos] = await Promise.all([getViajes(), getMotos()]);

  const anios = [...new Set(todos.map((v) => v.fecha_inicio.slice(0, 4)))].sort().reverse();
  const texto = q.trim().toLowerCase();
  const viajes = todos.filter(
    (v) =>
      (!anio || v.fecha_inicio.startsWith(anio)) &&
      (!moto || v.moto_id === moto) &&
      (!etiqueta || (v.etiquetas ?? []).includes(etiqueta)) &&
      (!texto ||
        [v.titulo, v.origen, v.destino, v.notas, ...(v.etiquetas ?? [])].some((c) => c?.toLowerCase().includes(texto)))
  );

  // Agrupar por año
  const grupos = new Map<string, typeof viajes>();
  for (const v of viajes) {
    const a = v.fecha_inicio.slice(0, 4);
    grupos.set(a, [...(grupos.get(a) || []), v]);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-5xl font-bold uppercase">Viajes</h1>
        <form className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
          <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-niebla" />
            <input name="q" defaultValue={q} placeholder="Buscar destino, ruta…" className="input pl-9" />
          </div>
          <select name="anio" defaultValue={anio} className="input w-28">
            <option value="">Todos</option>
            {anios.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          {motos.length > 1 && (
            <select name="moto" defaultValue={moto} className="input w-36">
              <option value="">Todas las motos</option>
              {motos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          )}
          {etiqueta && <input type="hidden" name="etiqueta" value={etiqueta} />}
          <button className="btn-ghost">Filtrar</button>
        </form>
      </div>

      {etiqueta && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-niebla">Etiqueta:</span>
          <Link
            href={`/viajes?${new URLSearchParams({ ...(q ? { q } : {}), ...(anio ? { anio } : {}), ...(moto ? { moto } : {}) })}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-naranja/15 px-3 py-1 text-naranja hover:bg-naranja/25"
          >
            <Tag className="size-3.5" /> {etiqueta} <X className="size-3.5" />
          </Link>
        </div>
      )}

      {!viajes.length && (
        <div className="card space-y-4 p-10 text-center text-niebla">
          <SearchX className="mx-auto size-10" strokeWidth={1.5} />
          {todos.length ? (
            <p>No hay viajes con ese filtro.</p>
          ) : (
            <>
              <p>Todavía no hay viajes.</p>
              <Link href="/viajes/nuevo" className="btn-primary">
                <Plus className="size-4" /> Cargar el primero
              </Link>
            </>
          )}
        </div>
      )}

      {[...grupos.entries()].map(([a, lista]) => (
        <section key={a} className="space-y-4">
          <div className="flex items-baseline gap-3 border-b border-linea pb-2">
            <h2 className="font-display text-3xl font-bold">{a}</h2>
            <span className="text-sm text-niebla">
              {lista.length} {lista.length === 1 ? "viaje" : "viajes"} · {km(lista.reduce((s, v) => s + v.km, 0))}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lista.map((v) => (
              <ViajeCard key={v.id} v={v} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
