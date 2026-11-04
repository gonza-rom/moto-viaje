// Esqueleto mientras carga cualquier página de la app (se ve al navegar con mala señal)
export default function Cargando() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Cargando">
      <div className="h-10 w-48 rounded-lg bg-grafito" />
      <div className="card h-40" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card overflow-hidden">
            <div className="aspect-[4/3] bg-grafito" />
            <div className="space-y-2 p-4">
              <div className="h-4 w-3/4 rounded bg-grafito" />
              <div className="h-3 w-1/2 rounded bg-grafito" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
