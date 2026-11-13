"use client";

import { useState } from "react";
import { Check, HardDrive, LoaderCircle, Trash2 } from "lucide-react";
import { borrarSueltas, espacioCloudinary } from "@/app/acciones-extra";
import { cldMiniatura } from "@/lib/cld";

type Suelta = { public_id: string; tipo: "image" | "video"; bytes: number; creada: string };

/**
 * Espacio en Cloudinary y fotos que quedaron subidas sin estar en ningún viaje
 * (por ejemplo, de un borrador descartado). Se ven antes de borrarlas.
 */
export function EspacioFotos() {
  const [estado, setEstado] = useState<"" | "cargando" | "listo" | "borrando">("");
  const [datos, setDatos] = useState<{ usadoMB: number; sueltas: Suelta[] } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msj, setMsj] = useState("");
  const [ver, setVer] = useState(24);

  async function revisar() {
    setEstado("cargando");
    setMsj("");
    const r = await espacioCloudinary().catch(() => ({ usadoMB: 0, sueltas: [], error: "Sin conexión" }));
    if (r.error) {
      setMsj(r.error);
      setEstado("");
      return;
    }
    setDatos(r);
    setSel(new Set(r.sueltas.map((s) => s.public_id)));
    setEstado("listo");
  }

  async function borrar() {
    if (!datos || !sel.size) return;
    const mb = Math.round(datos.sueltas.filter((s) => sel.has(s.public_id)).reduce((a, s) => a + s.bytes, 0) / 1048576);
    if (!confirm(`¿Borrar ${sel.size} ${sel.size === 1 ? "foto" : "fotos"} sin usar (${mb} MB)? No están en ningún viaje y no se pueden recuperar.`)) return;
    setEstado("borrando");
    const r = await borrarSueltas([...sel]).catch(() => ({ borradas: 0, error: "Sin conexión" }));
    setMsj(r.error ? r.error : `Listo: ${r.borradas} borradas (${mb} MB liberados).`);
    await revisar();
  }

  const mbSueltas = datos ? Math.round(datos.sueltas.reduce((a, s) => a + s.bytes, 0) / 1048576) : 0;

  return (
    <section className="card space-y-3 p-5">
      <h2 className="label flex items-center gap-1.5">
        <HardDrive className="size-3.5" /> Espacio de fotos
      </h2>
      {!datos ? (
        <button type="button" onClick={revisar} disabled={estado === "cargando"} className="btn-ghost disabled:opacity-50">
          {estado === "cargando" ? <LoaderCircle className="size-4 animate-spin" /> : <HardDrive className="size-4" />} Revisar espacio
        </button>
      ) : (
        <>
          <p className="text-sm">
            Usás <b>{(datos.usadoMB / 1024).toFixed(1).replace(".", ",")} GB</b> en Cloudinary.{" "}
            {datos.sueltas.length ? (
              <>
                Hay <b>{datos.sueltas.length}</b> {datos.sueltas.length === 1 ? "foto subida" : "fotos subidas"} que no están en ningún viaje (
                {mbSueltas} MB): suelen ser de borradores descartados o fotos que se subieron dos veces.
              </>
            ) : (
              "No hay fotos sueltas: todo lo subido está en algún viaje."
            )}
          </p>
          {datos.sueltas.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <button type="button" onClick={() => setSel(new Set(datos.sueltas.map((s) => s.public_id)))} className="rounded-full border border-linea px-3 py-1">
                  Todas
                </button>
                <button type="button" onClick={() => setSel(new Set())} className="rounded-full border border-linea px-3 py-1">
                  Ninguna
                </button>
                <span className="self-center text-niebla">{sel.size} elegidas · tocá una para sacarla</span>
              </div>
              <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
                {datos.sueltas.slice(0, ver).map((s) => {
                  const si = sel.has(s.public_id);
                  return (
                    <li key={s.public_id}>
                      <button
                        type="button"
                        onClick={() =>
                          setSel((x) => {
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
                        <img src={cldMiniatura(s, { w: 160, h: 160, crop: "fill" })} alt="" loading="lazy" className="size-full object-cover" />
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
              {ver < datos.sueltas.length && (
                <button type="button" onClick={() => setVer((v) => v + 48)} className="btn-ghost w-full py-2 text-xs">
                  Ver más ({datos.sueltas.length - ver})
                </button>
              )}
              <button type="button" onClick={borrar} disabled={!sel.size || estado === "borrando"} className="btn-ghost text-red-400 disabled:opacity-50">
                {estado === "borrando" ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Borrar las {sel.size} elegidas
              </button>
            </>
          )}
        </>
      )}
      {msj && <p className="text-xs text-niebla">{msj}</p>}
    </section>
  );
}
