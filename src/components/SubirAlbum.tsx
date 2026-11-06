"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, ImagePlus, LoaderCircle } from "lucide-react";
import { leerExif } from "@/lib/exif";
import { agregarFotoAlbum } from "@/app/acciones-album";

type Firma = {
  signature: string;
  timestamp: number;
  folder: string;
  allowed_formats: string;
  apiKey: string;
  cloudName: string;
};
type Item = { key: string; nombre: string; preview: string; progreso: number; estado: "subiendo" | "ok" | "error"; error?: string };

const CLAVE_NOMBRE = "mv:album:nombre";
const MAX_MB = 40;

function subir(file: File, f: Firma, onProgress: (p: number) => void): Promise<{ public_id: string }> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("api_key", f.apiKey);
    fd.append("timestamp", String(f.timestamp));
    fd.append("signature", f.signature);
    fd.append("folder", f.folder);
    fd.append("allowed_formats", f.allowed_formats);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${f.cloudName}/image/upload`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let r: { public_id?: string; error?: { message?: string } } = {};
      try {
        r = JSON.parse(xhr.responseText || "{}");
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && r.public_id) resolve({ public_id: r.public_id });
      else reject(new Error(/format/i.test(r.error?.message ?? "") ? "Ese formato no se acepta" : "No se pudo subir"));
    };
    xhr.onerror = () => reject(new Error("Sin conexión"));
    xhr.send(fd);
  });
}

export function SubirAlbum({ token }: { token: string }) {
  const [nombre, setNombre] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setNombre(localStorage.getItem(CLAVE_NOMBRE) ?? ""), []);

  const actualizar = (key: string, cambios: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...cambios } : x)));

  async function elegir(lista: FileList) {
    const quien = nombre.trim();
    if (!quien) return alert("Primero poné tu nombre");
    localStorage.setItem(CLAVE_NOMBRE, quien);
    const files = Array.from(lista).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    const nuevos = files.map((f) => ({
      file: f,
      item: {
        key: `${f.name}-${f.size}-${Math.random().toString(36).slice(2)}`,
        nombre: f.name,
        preview: URL.createObjectURL(f),
        progreso: 0,
        estado: "subiendo" as const,
      },
    }));
    setItems((xs) => [...nuevos.map((n) => n.item), ...xs]);

    // De a 3 a la vez
    const cola = [...nuevos];
    const trabajador = async () => {
      for (let n = cola.shift(); n; n = cola.shift()) {
        const { file, item } = n;
        try {
          if (file.size > MAX_MB * 1048576) throw new Error(`Pesa más de ${MAX_MB} MB`);
          const [exif, firma] = await Promise.all([
            leerExif(file).catch(() => ({ tomada_en: null, lat: null, lng: null })),
            fetch(`/api/album/${token}/firma`, { method: "POST" }).then(async (r) => {
              const j = await r.json();
              if (!r.ok) throw new Error(j.error || "El link ya no está activo");
              return j as Firma;
            }),
          ]);
          const { public_id } = await subir(file, firma, (p) => actualizar(item.key, { progreso: p }));
          const r = await agregarFotoAlbum(token, { public_id, ...exif }, quien);
          if (r.error) throw new Error(r.error);
          actualizar(item.key, { estado: "ok", progreso: 100 });
        } catch (e) {
          actualizar(item.key, { estado: "error", error: (e as Error).message });
        }
      }
    };
    await Promise.all([trabajador(), trabajador(), trabajador()]);
  }

  const ok = items.filter((x) => x.estado === "ok").length;
  const subiendo = items.filter((x) => x.estado === "subiendo").length;

  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="quien">
          Tu nombre
        </label>
        <input id="quien" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={40} placeholder="Ej: Juan" className="input" />
      </div>

      <button
        type="button"
        onClick={() => (nombre.trim() ? input.current?.click() : alert("Primero poné tu nombre"))}
        className="grid w-full place-items-center rounded-2xl border-2 border-dashed border-linea px-4 py-10 text-center transition hover:border-naranja"
      >
        <ImagePlus className="mx-auto size-10 text-niebla" strokeWidth={1.5} />
        <span className="mt-2 block font-medium">Elegir fotos</span>
        <span className="block text-xs text-niebla">Se suben en calidad original · JPG, PNG, HEIC</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) elegir(e.target.files);
          e.target.value = "";
        }}
      />

      {items.length > 0 && (
        <>
          <p className="text-sm text-niebla" role="status">
            {subiendo ? `Subiendo… ${ok} de ${items.length}` : `Listo: ${ok} ${ok === 1 ? "foto subida" : "fotos subidas"}. ¡Gracias!`}
          </p>
          <ul className="grid grid-cols-3 gap-2">
            {items.map((x) => (
              <li key={x.key} className="relative aspect-square overflow-hidden rounded-xl bg-grafito">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={x.preview} alt="" className={`size-full object-cover ${x.estado === "ok" ? "" : "opacity-50"}`} />
                <span className="absolute inset-0 grid place-items-center p-2 text-center text-xs">
                  {x.estado === "subiendo" && (
                    <span className="flex flex-col items-center gap-1">
                      <LoaderCircle className="size-5 animate-spin" /> {x.progreso}%
                    </span>
                  )}
                  {x.estado === "ok" && (
                    <span className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-emerald-500 text-black">
                      <Check className="size-4" strokeWidth={3} />
                    </span>
                  )}
                  {x.estado === "error" && (
                    <span className="flex flex-col items-center gap-1 text-red-300">
                      <CircleAlert className="size-5" /> {x.error}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
