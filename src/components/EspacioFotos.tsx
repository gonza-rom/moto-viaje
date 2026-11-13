"use client";

import { useState } from "react";
import { Check, Copy, HardDrive, LoaderCircle, Lightbulb, Minimize2, Trash2 } from "lucide-react";
import { borrarRepetidas, borrarSueltas, optimizarFotos, revisarEspacio, type Espacio } from "@/app/acciones-espacio";
import { cldMiniatura } from "@/lib/cld";

const MB = 1048576;
const mb = (b: number) => Math.round(b / MB);
const gb = (m: number) => (m / 1024).toFixed(1).replace(".", ",");

/**
 * Espacio en Cloudinary (plan gratis: 25 créditos por mes). Muestra el uso, recomienda qué hacer y
 * permite borrar fotos repetidas o sueltas y optimizar las pesadas. Nada se borra sin confirmar.
 */
export function EspacioFotos() {
  const [d, setD] = useState<Espacio | null>(null);
  const [trabajando, setTrabajando] = useState("");
  const [msj, setMsj] = useState("");
  const [selSueltas, setSelSueltas] = useState<Set<string>>(new Set());
  const [verSueltas, setVerSueltas] = useState(24);
  const [progreso, setProgreso] = useState<{ hechas: number; total: number; ahorro: number } | null>(null);

  async function revisar() {
    setTrabajando("Revisando…");
    const r = await revisarEspacio().catch(() => null);
    setTrabajando("");
    if (!r || r.error) return setMsj(r?.error ?? "Sin conexión");
    setD(r);
    setSelSueltas(new Set(r.sueltas.map((s) => s.public_id)));
  }

  const repetidasBytes = d ? d.repetidas.flatMap((g) => g.sobran).reduce((a, s) => a + s.bytes, 0) : 0;
  const nRepetidas = d ? d.repetidas.reduce((a, g) => a + g.sobran.length, 0) : 0;
  const sueltasBytes = d ? d.sueltas.reduce((a, s) => a + s.bytes, 0) : 0;
  // Las fotos optimizadas quedan en ~17 % de su peso (medido con fotos reales)
  const ahorroOptimizar = d ? Math.round(d.grandes.bytes * 0.83) : 0;

  async function borrarTodasRepetidas() {
    if (!d || !nRepetidas) return;
    if (!confirm(`¿Sacar ${nRepetidas} ${nRepetidas === 1 ? "foto repetida" : "fotos repetidas"} de tus viajes (${mb(repetidasBytes)} MB)? En cada caso queda una copia (la que tiene más datos: favorita, descripción, lugar).`)) return;
    setTrabajando("Borrando repetidas…");
    const r = await borrarRepetidas(d.repetidas.flatMap((g) => g.sobran.map((s) => s.id))).catch(() => ({ borradas: 0, error: "Sin conexión" }));
    setMsj(r.error ? r.error : `Listo: ${r.borradas} repetidas borradas (${mb(repetidasBytes)} MB liberados).`);
    await revisar();
  }

  async function borrarSueltasElegidas() {
    if (!d || !selSueltas.size) return;
    const bytes = d.sueltas.filter((s) => selSueltas.has(s.public_id)).reduce((a, s) => a + s.bytes, 0);
    if (!confirm(`¿Borrar ${selSueltas.size} ${selSueltas.size === 1 ? "foto suelta" : "fotos sueltas"} (${mb(bytes)} MB)? No están en ningún viaje y no se pueden recuperar.`)) return;
    setTrabajando("Borrando sueltas…");
    const r = await borrarSueltas([...selSueltas]).catch(() => ({ borradas: 0, error: "Sin conexión" }));
    setMsj(r.error ? r.error : `Listo: ${r.borradas} sueltas borradas (${mb(bytes)} MB liberados).`);
    await revisar();
  }

  async function optimizar() {
    if (!d || !d.grandes.ids.length) return;
    if (
      !confirm(
        `Se van a reemplazar ${d.grandes.ids.length} fotos por una versión de hasta 3072 px (9 megapíxeles) en calidad buena: ` +
          `se ven igual en el celular y la compu, pero ya no vas a tener el archivo original de 12 MP. ` +
          `Ahorro estimado: ${gb(mb(ahorroOptimizar))} GB.\n\nTarda unos minutos; dejá esta pantalla abierta. ¿Seguir?`
      )
    )
      return;
    const ids = [...d.grandes.ids];
    let ahorro = 0;
    let hechas = 0;
    setProgreso({ hechas: 0, total: ids.length, ahorro: 0 });
    for (let i = 0; i < ids.length; i += 4) {
      const r = await optimizarFotos(ids.slice(i, i + 4)).catch(() => ({ hechas: 0, ahorro: 0, errores: 4 }));
      hechas += r.hechas;
      ahorro += r.ahorro;
      setProgreso({ hechas: Math.min(ids.length, i + 4), total: ids.length, ahorro });
    }
    setProgreso(null);
    setMsj(`Listo: ${hechas} fotos optimizadas, ${gb(mb(ahorro))} GB liberados. El total que muestra Cloudinary se actualiza en unas horas.`);
    await revisar();
  }

  // Recomendaciones, de la que más ahorra a la que menos
  const recs = d
    ? [
        d.grandes.ids.length > 0 && { ahorro: ahorroOptimizar, texto: `Optimizar ${d.grandes.ids.length} fotos pesadas: ahorrás ~${gb(mb(ahorroOptimizar))} GB` },
        nRepetidas > 0 && { ahorro: repetidasBytes, texto: `Borrar ${nRepetidas} fotos repetidas: ahorrás ${mb(repetidasBytes)} MB` },
        d.sueltas.length > 0 && { ahorro: sueltasBytes, texto: `Borrar ${d.sueltas.length} fotos sueltas (no están en ningún viaje): ahorrás ${mb(sueltasBytes)} MB` },
      ]
        .filter((x): x is { ahorro: number; texto: string } => !!x)
        .sort((a, b) => b.ahorro - a.ahorro)
    : [];

  return (
    <section id="espacio" className="card space-y-4 p-5">
      <h2 className="label flex items-center gap-1.5">
        <HardDrive className="size-3.5" /> Espacio de fotos (Cloudinary)
      </h2>

      {!d ? (
        <button type="button" onClick={revisar} disabled={!!trabajando} className="btn-ghost disabled:opacity-50">
          {trabajando ? <LoaderCircle className="size-4 animate-spin" /> : <HardDrive className="size-4" />} {trabajando || "Revisar espacio"}
        </button>
      ) : (
        <>
          {/* Créditos del mes */}
          {d.creditos && (
            <div className="space-y-1.5">
              <p className="flex items-baseline justify-between text-sm">
                <span>Créditos de los últimos 30 días</span>
                <b className={d.creditos.usado / d.creditos.limite > 0.8 ? "text-red-400" : ""}>
                  {String(d.creditos.usado).replace(".", ",")} de {d.creditos.limite}
                </b>
              </p>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-white/10">
                {[
                  { v: d.almacenamientoMB / 1024, c: "bg-naranja" },
                  { v: d.transformaciones / 1000, c: "bg-sky-400" },
                  { v: d.transferenciaMB / 1024, c: "bg-emerald-400" },
                ].map((x, i) => (
                  <span key={i} className={x.c} style={{ width: `${(x.v / d.creditos!.limite) * 100}%` }} />
                ))}
              </div>
              <ul className="grid gap-x-4 gap-y-0.5 text-xs text-niebla sm:grid-cols-3">
                <li>
                  <span className="mr-1 inline-block size-2 rounded-full bg-naranja" />
                  Guardado: {gb(d.almacenamientoMB)} GB ≈ {gb(d.almacenamientoMB)} créditos
                </li>
                <li>
                  <span className="mr-1 inline-block size-2 rounded-full bg-sky-400" />
                  Versiones generadas: {d.transformaciones.toLocaleString("es-AR")} ≈ {(d.transformaciones / 1000).toFixed(1).replace(".", ",")}
                </li>
                <li>
                  <span className="mr-1 inline-block size-2 rounded-full bg-emerald-400" />
                  Transferencia: {d.transferenciaMB} MB ≈ {(d.transferenciaMB / 1024).toFixed(1).replace(".", ",")}
                </li>
              </ul>
              <p className="text-[11px] text-niebla/70">
                1 crédito = 1 GB guardado, 1 GB transferido o 1000 versiones generadas. Lo guardado cuenta todos los meses; lo demás, solo el mes que pasa.
              </p>
            </div>
          )}

          {/* Recomendaciones */}
          {recs.length > 0 ? (
            <div className="space-y-1.5 rounded-xl border border-naranja/30 bg-naranja/5 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Lightbulb className="size-4 text-naranja" /> Para liberar espacio
              </p>
              <ol className="list-decimal space-y-0.5 pl-5 text-sm">
                {recs.map((r) => (
                  <li key={r.texto}>{r.texto}</li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="text-sm text-emerald-300">Todo en orden: sin repetidas, sin fotos sueltas y todas optimizadas.</p>
          )}

          {/* Repetidas */}
          {nRepetidas > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Copy className="size-4" /> {nRepetidas} {nRepetidas === 1 ? "foto repetida" : "fotos repetidas"} en tus viajes · se recomienda borrarlas
              </p>
              <p className="text-xs text-niebla">Misma imagen subida dos veces en el mismo viaje. Queda la de la izquierda (la que tiene más datos).</p>
              <ul className="space-y-1.5">
                {d.repetidas.slice(0, 20).map((g) => (
                  <li key={g.queda.id} className="flex items-center gap-2 text-xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cldMiniatura({ public_id: g.queda.public_id }, { w: 400, h: 400, crop: "fill" })} alt="" className="size-12 rounded-md object-cover ring-2 ring-emerald-400" />
                    <span className="text-niebla">queda · sobra{g.sobran.length > 1 ? "n" : ""} →</span>
                    {g.sobran.map((s) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={s.id} src={cldMiniatura({ public_id: s.public_id }, { w: 400, h: 400, crop: "fill" })} alt="" className="size-12 rounded-md object-cover opacity-60 ring-2 ring-red-400" />
                    ))}
                    <span className="truncate text-niebla">{g.titulo}</span>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={borrarTodasRepetidas} disabled={!!trabajando} className="btn-ghost text-red-400 disabled:opacity-50">
                <Trash2 className="size-4" /> Borrar las {nRepetidas} repetidas
              </button>
            </div>
          )}

          {/* Optimizar */}
          {d.grandes.ids.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Minimize2 className="size-4" /> {d.grandes.ids.length} fotos pesadas ({gb(mb(d.grandes.bytes))} GB)
              </p>
              <p className="text-xs text-niebla">
                Las fotos nuevas ya se guardan optimizadas (hasta 3072 px). Las que subiste antes se pueden achicar igual: quedan en ~
                {gb(mb(d.grandes.bytes - ahorroOptimizar))} GB.
              </p>
              {progreso ? (
                <div className="space-y-1">
                  <p className="flex items-center gap-2 text-sm">
                    <LoaderCircle className="size-4 animate-spin text-naranja" /> Optimizando {progreso.hechas} de {progreso.total} · ahorrado {mb(progreso.ahorro)} MB
                  </p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full bg-naranja transition-all" style={{ width: `${(progreso.hechas / progreso.total) * 100}%` }} />
                  </div>
                  <p className="text-[11px] text-niebla">No cierres esta pantalla. Si se corta, volvé a tocar el botón y sigue con las que falten.</p>
                </div>
              ) : (
                <button type="button" onClick={optimizar} disabled={!!trabajando} className="btn-primary disabled:opacity-50">
                  <Minimize2 className="size-4" /> Optimizar las {d.grandes.ids.length} fotos
                </button>
              )}
            </div>
          )}

          {/* Sueltas */}
          {d.sueltas.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">
                {d.sueltas.length} {d.sueltas.length === 1 ? "foto suelta" : "fotos sueltas"} ({mb(sueltasBytes)} MB) · subidas que no están en ningún viaje
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <button type="button" onClick={() => setSelSueltas(new Set(d.sueltas.map((s) => s.public_id)))} className="rounded-full border border-linea px-3 py-1">
                  Todas
                </button>
                <button type="button" onClick={() => setSelSueltas(new Set())} className="rounded-full border border-linea px-3 py-1">
                  Ninguna
                </button>
                <span className="self-center text-niebla">{selSueltas.size} elegidas · tocá una para sacarla</span>
              </div>
              <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
                {d.sueltas.slice(0, verSueltas).map((s) => {
                  const si = selSueltas.has(s.public_id);
                  return (
                    <li key={s.public_id}>
                      <button
                        type="button"
                        onClick={() =>
                          setSelSueltas((x) => {
                            const n = new Set(x);
                            if (n.has(s.public_id)) n.delete(s.public_id);
                            else n.add(s.public_id);
                            return n;
                          })
                        }
                        className={`relative block aspect-square w-full overflow-hidden rounded-lg ${si ? "ring-2 ring-red-400" : "opacity-50"}`}
                        title={`Subida ${s.creada.slice(0, 10)} · ${Math.round(s.bytes / 1024)} KB`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={cldMiniatura(s, { w: 400, h: 400, crop: "fill" })} alt="" loading="lazy" className="size-full object-cover" />
                        {si && (
                          <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-red-500 text-white">
                            <Check className="size-3.5" strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {verSueltas < d.sueltas.length && (
                <button type="button" onClick={() => setVerSueltas((v) => v + 48)} className="btn-ghost w-full py-2 text-xs">
                  Ver más ({d.sueltas.length - verSueltas})
                </button>
              )}
              <button type="button" onClick={borrarSueltasElegidas} disabled={!selSueltas.size || !!trabajando} className="btn-ghost text-red-400 disabled:opacity-50">
                <Trash2 className="size-4" /> Borrar las {selSueltas.size} elegidas
              </button>
            </div>
          )}

          {trabajando && (
            <p className="flex items-center gap-2 text-sm text-niebla">
              <LoaderCircle className="size-4 animate-spin" /> {trabajando}
            </p>
          )}
        </>
      )}
      {msj && <p className="text-xs text-niebla">{msj}</p>}
    </section>
  );
}
