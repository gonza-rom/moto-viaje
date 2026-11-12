"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { descartarSubida, type Estado } from "@/app/actions";
import {
  CircleAlert,
  ChevronLeft,
  ChevronRight,
  FileUp,
  Gauge,
  ImagePlus,
  LoaderCircle,
  MapPinned,
  Play,
  Save,
  Star,
  CalendarArrowUp,
  History,
  Wifi,
  WifiOff,
  NotebookPen,
  Tag,
  Heart,
  MapPin,
  X,
} from "lucide-react";
import { EditorRutaLazy, MapaRutaLazy } from "./mapas";
import { cldMiniatura, duracionTxt, type TipoMedio } from "@/lib/cld";
import { leerExif } from "@/lib/exif";
import { leerMetaVideo } from "@/lib/video-meta";
import { esKml, kmlAGpx } from "@/lib/kml";
import { CATEGORIAS } from "@/lib/categorias";
import { borrarBorrador, borrarPendiente, borrarPendientesDe, guardarBorrador, guardarPendiente, haceCuanto, leerBorrador, listarPendientes, type Borrador } from "@/lib/offline";

/** Fotos por página en el formulario */
const POR_PAGINA = 24;

const ETIQUETAS_SUGERIDAS = ["asfalto", "ripio", "tierra", "montaña", "paso fronterizo", "lluvia", "frío", "camping", "con acompañante", "solo", "grupal"];
import { fechaHoraFoto } from "@/lib/fotos";
import { distanciaKm, parseGpx, type Punto } from "@/lib/gpx";
import type { Ruta } from "@/lib/ruta";
import type { FotoDraft, Moto, ViajeConRelaciones } from "@/lib/types";

type Subida = { key: string; nombre: string; tipo: TipoMedio; progreso: number; error?: string; preview: string; espera?: boolean };

// Plan gratuito de Cloudinary: 100 MB por video. Ajustable si tenés otro plan.
const MAX_VIDEO_MB = Number(process.env.NEXT_PUBLIC_CLOUDINARY_MAX_VIDEO_MB) || 100;
// Arriba de esto se sube en partes (Cloudinary no acepta >100 MB en un solo request)
const CHUNK = 20 * 1024 * 1024;

const esVideo = (f: File) => f.type.startsWith("video/") || /\.(mov|mp4|m4v|webm|3gp|mkv)$/i.test(f.name);
const esImagen = (f: File) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name);

type Firma = {
  signature: string;
  timestamp: number;
  folder: string;
  apiKey: string;
  cloudName: string;
  resourceType: "image" | "video" | "raw";
};

type Resultado = { public_id: string; secure_url: string; width?: number; height?: number; duration?: number };

async function firmar(tipo: "foto" | "video" | "gpx"): Promise<Firma> {
  const r = await fetch("/api/cloudinary/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo }),
  });
  if (!r.ok) throw new Error("No se pudo firmar la subida");
  return r.json();
}

function enviarParte(
  file: Blob,
  firma: Firma,
  onProgress: (loaded: number) => void,
  rango?: { inicio: number; fin: number; total: number; uploadId: string }
): Promise<Resultado> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("api_key", firma.apiKey);
    fd.append("timestamp", String(firma.timestamp));
    fd.append("signature", firma.signature);
    fd.append("folder", firma.folder);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${firma.cloudName}/${firma.resourceType}/upload`);
    if (rango) {
      xhr.setRequestHeader("X-Unique-Upload-Id", rango.uploadId);
      xhr.setRequestHeader("Content-Range", `bytes ${rango.inicio}-${rango.fin - 1}/${rango.total}`);
    }
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded);
    xhr.onload = () => {
      let res: Partial<Resultado> & { error?: { message?: string } } = {};
      try {
        res = JSON.parse(xhr.responseText || "{}");
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(res as Resultado);
      else reject(new Error(res?.error?.message || `Error subiendo (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Error de red"));
    xhr.send(fd);
  });
}

/** Sube directo a Cloudinary; archivos grandes (videos) van en partes de 20 MB */
async function subirACloudinary(file: File, firma: Firma, onProgress: (p: number) => void): Promise<Resultado> {
  const pct = (bytes: number) => onProgress(Math.min(100, Math.round((bytes / file.size) * 100)));
  if (file.size <= CHUNK) return enviarParte(file, firma, pct);

  const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let res: Resultado | undefined;
  for (let inicio = 0; inicio < file.size; inicio += CHUNK) {
    const fin = Math.min(inicio + CHUNK, file.size);
    res = await enviarParte(file.slice(inicio, fin), firma, (l) => pct(inicio + l), {
      inicio,
      fin,
      total: file.size,
      uploadId,
    });
  }
  return res!;
}

function GuardarBtn({ pending, bloqueado, esperando, editando }: { pending: boolean; bloqueado: boolean; esperando?: boolean; editando: boolean }) {
  return (
    <button disabled={pending || bloqueado} className="btn-primary min-w-40">
      {pending || bloqueado ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
      {pending ? "Guardando…" : bloqueado ? (esperando ? "Esperando señal…" : "Subiendo archivos…") : editando ? "Guardar cambios" : "Guardar viaje"}
    </button>
  );
}

export function ViajeForm({
  motos,
  viaje,
  action,
}: {
  motos: Moto[];
  viaje?: ViajeConRelaciones;
  action: (prev: Estado, fd: FormData) => Promise<Estado>;
}) {
  const hoy = new Date().toISOString().slice(0, 10);

  const [fotos, setFotos] = useState<FotoDraft[]>(
    () =>
      viaje?.fotos.map((f) => ({
        id: f.id,
        tipo: f.tipo ?? "image",
        public_id: f.public_id,
        width: f.width,
        height: f.height,
        duracion: f.duracion,
        caption: f.caption || "",
        tomada_en: f.tomada_en ?? null,
        lat: f.lat ?? null,
        lng: f.lng ?? null,
        favorita: f.favorita ?? false,
        categoria: f.categoria ?? null,
      })) ?? []
  );
  const [subidas, setSubidas] = useState<Subida[]>([]);
  const [drag, setDrag] = useState(false);
  const inputFotos = useRef<HTMLInputElement>(null);
  // Fotos de a páginas: con cientos de fotos, mostrarlas todas juntas hacía la página larguísima y pesada
  const [paginaFotos, setPaginaFotos] = useState(0);
  const [eligiendoPortada, setEligiendoPortada] = useState(false);
  const totalPaginas = Math.max(1, Math.ceil(fotos.length / POR_PAGINA));
  const inicioPagina = Math.min(paginaFotos, totalPaginas - 1) * POR_PAGINA;

  // Km / odómetro
  const [kmTxt, setKmTxt] = useState(viaje ? String(viaje.km) : "");
  const [odoIni, setOdoIni] = useState(viaje?.odometro_inicio?.toString() ?? "");
  const [odoFin, setOdoFin] = useState(viaje?.odometro_fin?.toString() ?? "");

  // GPX
  const [gpx, setGpx] = useState<{ public_id: string; url: string } | null>(
    viaje?.gpx_public_id && viaje.gpx_url ? { public_id: viaje.gpx_public_id, url: viaje.gpx_url } : null
  );
  const [gpxPuntos, setGpxPuntos] = useState<Punto[] | undefined>();
  const [gpxKm, setGpxKm] = useState<number | null>(null);
  const [gpxEstado, setGpxEstado] = useState<string>("");

  // Ruta trazada en el mapa
  const [origen, setOrigen] = useState(viaje?.origen ?? "");
  const [destino, setDestino] = useState(viaje?.destino ?? "");
  const [ruta, setRuta] = useState<Ruta | null>(viaje?.ruta ?? null);

  // Fechas (controladas: el diario arma un día por cada fecha del viaje)
  const [fechaIni, setFechaIni] = useState(viaje?.fecha_inicio ?? hoy);
  const [fechaFin, setFechaFin] = useState(viaje?.fecha_fin ?? "");
  const [diario, setDiario] = useState<Record<string, string>>(viaje?.diario ?? {});
  const [etiquetas, setEtiquetas] = useState<string[]>(viaje?.etiquetas ?? []);
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState("");
  const diasViaje = useMemo(() => {
    const out: string[] = [];
    if (!fechaIni || fechaIni.length !== 10) return out;
    const fin = fechaFin && fechaFin >= fechaIni ? fechaFin : fechaIni;
    const d = new Date(`${fechaIni}T00:00:00Z`);
    while (out.length < 60) {
      const k = d.toISOString().slice(0, 10);
      out.push(k);
      if (k >= fin) break;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
  }, [fechaIni, fechaFin]);
  const alternarEtiqueta = (t: string) =>
    setEtiquetas((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t].slice(0, 15)));
  const [verEditor, setVerEditor] = useState(!!viaje?.ruta);
  const kmAuto = useRef<string | null>(null); // último km puesto automáticamente

  function cambiarRuta(r: Ruta | null) {
    setRuta(r);
    // Autocompletar km si está vacío o si lo habíamos puesto nosotros
    if (r && !gpx) {
      setKmTxt((actual) => {
        if (actual === "" || actual === kmAuto.current) {
          kmAuto.current = String(r.km);
          return String(r.km);
        }
        return actual;
      });
    }
  }

  const kmOdometro = useMemo(() => {
    const a = parseInt(odoIni.replace(/\./g, ""), 10);
    const b = parseInt(odoFin.replace(/\./g, ""), 10);
    return Number.isFinite(a) && Number.isFinite(b) && b > a ? b - a : null;
  }, [odoIni, odoFin]);

  /* ───── Fotos ───── */

  /* Clave del borrador: un borrador por viaje (o uno para "nuevo") */
  const claveBorrador = `mv:borrador:${viaje?.id ?? "nuevo"}`;
  const procesando = useRef(new Set<string>());

  /** Sube un archivo; si no hay señal lo guarda en el celular y queda "esperando señal" */
  async function subirUno(file: File, sub: Subida) {
    if (procesando.current.has(sub.key)) return;
    procesando.current.add(sub.key);
    try {
      if (!navigator.onLine) throw new TypeError("offline");
      setSubidas((s) => s.map((x) => (x.key === sub.key ? { ...x, espera: false, progreso: 0 } : x)));
      // Fecha y GPS de la foto/video, leído en el celular mientras sube
      const meta = sub.tipo === "image" ? leerExif(file) : leerMetaVideo(file);
      const firma = await firmar(sub.tipo === "video" ? "video" : "foto");
      const res = await subirACloudinary(file, firma, (p) =>
        setSubidas((s) => s.map((x) => (x.key === sub.key ? { ...x, progreso: p } : x)))
      );
      const datos = await meta;
      setFotos((f) => [
        ...f,
        {
          tipo: sub.tipo,
          public_id: res.public_id,
          width: res.width ?? null,
          height: res.height ?? null,
          duracion: res.duration ?? null,
          caption: "",
          tomada_en: datos?.tomada_en ?? null,
          lat: datos?.lat ?? null,
          lng: datos?.lng ?? null,
          favorita: false,
          categoria: null,
        },
      ]);
      setSubidas((s) => s.filter((x) => x.key !== sub.key));
      URL.revokeObjectURL(sub.preview);
      borrarPendiente(sub.key);
    } catch (e) {
      const sinRed = !navigator.onLine || e instanceof TypeError || (e as Error).message === "Error de red";
      if (sinRed) {
        // Guardar el archivo en el celular y reintentar cuando vuelva la señal
        await guardarPendiente({ id: sub.key, borrador: claveBorrador, file, nombre: sub.nombre, tipo: sub.tipo, creado: Date.now() });
        setSubidas((s) => s.map((x) => (x.key === sub.key ? { ...x, espera: true } : x)));
      } else {
        setSubidas((s) => s.map((x) => (x.key === sub.key ? { ...x, error: (e as Error).message } : x)));
      }
    } finally {
      procesando.current.delete(sub.key);
    }
  }

  /** 3 subidas en paralelo */
  async function subirVarios(items: { file: File; sub: Subida }[]) {
    const cola = [...items];
    const worker = async () => {
      while (cola.length) {
        const { file, sub } = cola.shift()!;
        await subirUno(file, sub);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  async function agregarFotos(lista: FileList | File[]) {
    const files = Array.from(lista).filter((f) => esImagen(f) || esVideo(f));
    if (!files.length) return;

    const nuevas: Subida[] = files.map((f) => {
      const tipo: TipoMedio = esVideo(f) ? "video" : "image";
      const muyGrande = tipo === "video" && f.size > MAX_VIDEO_MB * 1024 * 1024;
      return {
        key: `${f.name}-${f.size}-${Math.random().toString(36).slice(2)}`,
        nombre: f.name,
        tipo,
        progreso: 0,
        preview: URL.createObjectURL(f),
        error: muyGrande
          ? `Pesa ${Math.round(f.size / 1048576)} MB; el máximo es ${MAX_VIDEO_MB} MB. Recortalo o comprimilo.`
          : undefined,
      };
    });
    setSubidas((s) => [...s, ...nuevas]);
    await subirVarios(files.map((file, i) => ({ file, sub: nuevas[i] })).filter((x) => !x.sub.error));
  }

  /** Retoma los archivos guardados sin señal (al abrir el formulario y cuando vuelve la señal) */
  // Ref con las subidas actuales (para no duplicar al retomar)
  const subidasRef = useRef<Subida[]>([]);
  subidasRef.current = subidas;

  async function retomarPendientes() {
    const pend = await listarPendientes(claveBorrador);
    if (!pend.length) return;
    const yaEstan = new Set(subidasRef.current.map((x) => x.key));
    const nuevas: Subida[] = pend
      .filter((p) => !yaEstan.has(p.id))
      .map((p) => ({ key: p.id, nombre: p.nombre, tipo: p.tipo, progreso: 0, preview: URL.createObjectURL(p.file), espera: true }));
    if (nuevas.length) setSubidas((s) => [...s, ...nuevas]);
    if (!navigator.onLine) return;
    const todas = [...subidasRef.current, ...nuevas];
    await subirVarios(
      pend
        .map((p) => ({ file: p.file, sub: todas.find((x) => x.key === p.id) }))
        .filter((x): x is { file: File; sub: Subida } => !!x.sub && !x.sub.error)
    );
  }


  const mover = (i: number, d: number) =>
    setFotos((f) => {
      const j = i + d;
      if (j < 0 || j >= f.length) return f;
      const c = [...f];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  const portada = (i: number) =>
    setFotos((f) => {
      const c = [...f];
      const [x] = c.splice(i, 1);
      return [x, ...c];
    });

  /** Mover de una posición a otra (arrastrar y soltar) */
  const moverA = (de: number, a: number) =>
    setFotos((f) => {
      if (de === a || de < 0 || a < 0 || de >= f.length || a >= f.length) return f;
      const c = [...f];
      const [x] = c.splice(de, 1);
      c.splice(a, 0, x);
      return c;
    });
  const [arrastrando, setArrastrando] = useState<number | null>(null);

  /** Orden cronológico según la fecha de la foto; la portada queda primera */
  const ordenarPorFecha = () =>
    setFotos((f) => {
      const [primera, ...resto] = f;
      const ordenadas = [...resto].sort((a, b) =>
        a.tomada_en && b.tomada_en ? a.tomada_en.localeCompare(b.tomada_en) : a.tomada_en ? -1 : b.tomada_en ? 1 : 0
      );
      return primera ? [primera, ...ordenadas] : f;
    });
  const conFecha = fotos.filter((f) => f.tomada_en).length;

  const alternarFavorita = (i: number) =>
    setFotos((x) => x.map((y, j) => (j === i ? { ...y, favorita: !y.favorita } : y)));

  /* ───── GPX ───── */

  async function cargarGpx(original: File) {
    setGpxEstado(esKml(original) ? "Convirtiendo KML/KMZ…" : "Leyendo GPX…");
    try {
      // KML/KMZ (Google Earth, Mis Mapas…) se convierte a GPX y se guarda así
      const file = esKml(original) ? await kmlAGpx(original) : original;
      const texto = await file.text();
      const puntos = parseGpx(texto);
      if (puntos.length < 2) throw new Error("El archivo no tiene puntos de track");
      const dist = distanciaKm(puntos);
      setGpxPuntos(puntos);
      setGpxKm(dist);
      if (!kmTxt) setKmTxt(String(dist));

      setGpxEstado("Subiendo GPX…");
      const firma = await firmar("gpx");
      const res = await subirACloudinary(file, firma, () => {});
      descartarGpxBorrador();
      setGpx({ public_id: res.public_id, url: res.secure_url });
      setGpxEstado("");
    } catch (e) {
      setGpxEstado((e as Error).message);
    }
  }

  const subiendo = subidas.some((s) => !s.error) || gpxEstado.startsWith("Subiendo");

  /* ───── Envío, errores y cambios sin guardar ───── */

  // Si se cae la señal en el medio del envío, devolver un error en vez de romper la página
  const accionSegura = async (prev: Estado, fd: FormData): Promise<Estado> => {
    try {
      return await action(prev, fd);
    } catch (e) {
      if (!navigator.onLine || e instanceof TypeError) {
        return { error: "Sin señal: no se pudo guardar. Todo quedó guardado en el celular; tocá Guardar cuando vuelva la señal." };
      }
      throw e;
    }
  };
  const [estado, enviar, pendiente] = useActionState(accionSegura, undefined);
  const [sucio, setSucio] = useState(false);
  const enviando = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const montado = useRef(false);

  // Cualquier cambio en fotos, ruta o GPX marca el formulario como modificado
  useEffect(() => {
    if (montado.current) setSucio(true);
    else montado.current = true;
  }, [fotos, ruta, gpx]);

  // Si volvió un error, dejar de considerar que se está enviando y mostrarlo
  useEffect(() => {
    if (estado?.ir) {
      // Guardado: limpiar el borrador e ir al viaje (replace: "atrás" no vuelve al formulario)
      borrarBorrador(claveBorrador);
      setSucio(false);
      // Navegación completa: router.replace() desde acá queda enredado con la transición de la action
      // y no navega. replace: "atrás" no vuelve al formulario ya guardado.
      window.location.replace(estado.ir);
      return;
    }
    if (estado?.error) {
      enviando.current = false;
      guardarBorrador(claveBorrador, datosBorrador());
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [estado]);

  // Avisar antes de cerrar/recargar con cambios sin guardar
  useEffect(() => {
    if (!sucio && !subiendo) return;
    const h = (e: BeforeUnloadEvent) => {
      if (enviando.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [sucio, subiendo]);

  /** Borra de Cloudinary el GPX subido en esta edición si se reemplaza o quita (no el guardado) */
  function descartarGpxBorrador() {
    if (gpx && gpx.public_id !== viaje?.gpx_public_id) descartarSubida(gpx.public_id, "raw").catch(() => {});
  }

  function quitarFoto(i: number) {
    const f = fotos[i];
    if (f && !f.id) descartarSubida(f.public_id, f.tipo).catch(() => {});
    setFotos((x) => x.filter((_, j) => j !== i));
  }

  /* ───── Borrador en el celular y sin señal ───── */

  const formRef = useRef<HTMLFormElement>(null);
  const [version, setVersion] = useState(0); // cambia con los campos no controlados (título, moto, notas)
  const [borradorPrevio, setBorradorPrevio] = useState<Borrador | null>(null);
  const borradorPrevioRef = useRef<Borrador | null>(null);
  borradorPrevioRef.current = borradorPrevio;
  const [enLinea, setEnLinea] = useState(true);
  const [avisoSinSenal, setAvisoSinSenal] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [rutaEditor, setRutaEditor] = useState<Ruta | null>(viaje?.ruta ?? null);

  useEffect(() => {
    const previo = leerBorrador(claveBorrador);
    // Viene del planificador: cargar la ruta planeada directamente
    if (previo?.desdePlan) setAutoRecuperar(true);
    if (previo) setBorradorPrevio(previo);
    else retomarPendientes();
    setEnLinea(navigator.onLine);
    const on = () => {
      setEnLinea(true);
      if (!borradorPrevioRef.current) retomarPendientes();
    };
    const off = () => setEnLinea(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [autoRecuperar, setAutoRecuperar] = useState(false);
  // Plan del planificador del que sale este viaje (para comparar lo planeado con lo real)
  const [planId, setPlanId] = useState<string | null>(null);
  useEffect(() => {
    if (autoRecuperar && borradorPrevio) {
      setAutoRecuperar(false);
      recuperarBorrador();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRecuperar, borradorPrevio]);

  function datosBorrador() {
    const f = formRef.current;
    const val = (n: string) => (f?.elements.namedItem(n) as HTMLInputElement | null)?.value ?? "";
    return {
      titulo: val("titulo"),
      moto_id: val("moto_id"),
      notas: val("notas"),
      fechaIni,
      fechaFin,
      origen,
      destino,
      kmTxt,
      odoIni,
      odoFin,
      fotos,
      ruta,
      gpx,
      diario,
      etiquetas,
      planId,
    };
  }

  // Guardar el borrador en el celular (con una pausa) cada vez que algo cambia.
  // No se pisa un borrador anterior hasta que el usuario elija recuperarlo o descartarlo.
  useEffect(() => {
    if (!sucio || borradorPrevio || enviando.current) return;
    const t = setTimeout(() => guardarBorrador(claveBorrador, datosBorrador()), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucio, version, fechaIni, fechaFin, origen, destino, kmTxt, odoIni, odoFin, fotos, ruta, gpx, diario, etiquetas, borradorPrevio]);

  function recuperarBorrador() {
    const b = borradorPrevio as Borrador & ReturnType<typeof datosBorrador>;
    if (!b) return;
    setFotos(Array.isArray(b.fotos) ? b.fotos : []);
    setFechaIni(b.fechaIni || hoy);
    setFechaFin(b.fechaFin || "");
    setOrigen(b.origen || "");
    setDestino(b.destino || "");
    setKmTxt(b.kmTxt || "");
    setOdoIni(b.odoIni || "");
    setOdoFin(b.odoFin || "");
    setGpx(b.gpx ?? null);
    setDiario(b.diario ?? {});
    setEtiquetas(Array.isArray(b.etiquetas) ? b.etiquetas : []);
    setPlanId(typeof b.planId === "string" ? b.planId : null);
    setRuta(b.ruta ?? null);
    setRutaEditor(b.ruta ?? null);
    setVerEditor(!!b.ruta);
    setEditorKey((k) => k + 1);
    const f = formRef.current;
    for (const n of ["titulo", "moto_id", "notas"] as const) {
      const el = f?.elements.namedItem(n) as HTMLInputElement | null;
      if (el && typeof b[n] === "string") el.value = b[n];
    }
    setBorradorPrevio(null);
    setSucio(true);
    retomarPendientes();
  }

  function descartarBorrador() {
    borrarBorrador(claveBorrador);
    borrarPendientesDe(claveBorrador);
    setBorradorPrevio(null);
  }

  return (
    <form
      // Envío manual (no `action=`): React 19 vacía el formulario después de cada envío, incluso si hubo error
      onSubmit={(e) => {
        e.preventDefault();
        if (subiendo || pendiente) return;
        if (!navigator.onLine) {
          guardarBorrador(claveBorrador, datosBorrador());
          setAvisoSinSenal(true);
          return;
        }
        setAvisoSinSenal(false);
        enviando.current = true;
        borrarBorrador(claveBorrador);
        const fd = new FormData(e.currentTarget);
        startTransition(() => enviar(fd));
      }}
      onChange={() => {
        setSucio(true);
        setVersion((v) => v + 1);
      }}
      ref={formRef}
      className="space-y-8"
    >
      {borradorPrevio && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-naranja/40 bg-naranja/10 p-4 text-sm">
          <History className="size-5 shrink-0 text-naranja" />
          <p className="min-w-48 flex-1">
            Tenés un borrador sin guardar de este {viaje ? "viaje" : "viaje nuevo"} ({haceCuanto(borradorPrevio.guardado)}).
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={descartarBorrador} className="btn-ghost py-1.5">Descartar</button>
            <button type="button" onClick={recuperarBorrador} className="btn-primary py-1.5">Recuperar</button>
          </div>
        </div>
      )}
      {!enLinea && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
          <WifiOff className="mt-0.5 size-5 shrink-0 text-amber-300" />
          <p>
            <b>Sin señal.</b> Podés seguir cargando: todo se guarda en el celular y las fotos se suben solas cuando vuelva la señal.
          </p>
        </div>
      )}
      {enLinea && avisoSinSenal && (
        <div className="flex items-center gap-3 rounded-xl border border-green-500/40 bg-green-500/10 p-4 text-sm text-green-100">
          <Wifi className="size-5 shrink-0 text-green-300" /> Volvió la señal: ya podés tocar Guardar.
        </div>
      )}
      <input type="hidden" name="fotos" value={JSON.stringify(fotos)} />
      {!viaje && planId && <input type="hidden" name="plan_id" value={planId} />}
      <input type="hidden" name="gpx_public_id" value={gpx?.public_id ?? ""} />
      <input type="hidden" name="gpx_url" value={gpx?.url ?? ""} />
      <input type="hidden" name="ruta" value={ruta ? JSON.stringify(ruta) : ""} />
      <input type="hidden" name="diario" value={JSON.stringify(diario)} />
      <input type="hidden" name="etiquetas" value={JSON.stringify(etiquetas)} />

      {/* Datos */}
      <section className="card space-y-5 p-5 md:p-6">
        <h2 className="font-display text-2xl font-bold uppercase">El viaje</h2>

        <div>
          <label className="label" htmlFor="titulo">Título *</label>
          <input id="titulo" name="titulo" required defaultValue={viaje?.titulo} placeholder="Cuesta del Portezuelo" className="input" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="fecha_inicio">Salida *</label>
            <input id="fecha_inicio" name="fecha_inicio" type="date" required value={fechaIni} onChange={(e) => setFechaIni(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="fecha_fin">Regreso</label>
            <input id="fecha_fin" name="fecha_fin" type="date" value={fechaFin} min={fechaIni} onChange={(e) => setFechaFin(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="origen">Desde</label>
            <input id="origen" name="origen" value={origen} onChange={(e) => setOrigen(e.target.value)} placeholder="San Fernando del Valle de Catamarca" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="destino">Hasta</label>
            <input id="destino" name="destino" value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Fiambalá" className="input" />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="moto_id">Moto</label>
          <select id="moto_id" name="moto_id" defaultValue={viaje?.moto_id ?? motos[0]?.id ?? ""} className="input">
            <option value="">— Sin especificar —</option>
            {motos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
                {m.modelo ? ` · ${m.modelo}` : ""}
              </option>
            ))}
          </select>
          {!motos.length && (
            <p className="mt-1.5 text-xs text-niebla">
              Todavía no cargaste motos. <Link href="/motos" className="text-naranja underline">Agregar</Link>
            </p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="notas">Notas</label>
          <textarea id="notas" name="notas" rows={5} defaultValue={viaje?.notas ?? ""} placeholder="Ruta, clima, dónde cargaste nafta, dónde comiste…" className="input resize-y" />
        </div>

        {/* Etiquetas */}
        <div>
          <p className="label flex items-center gap-1.5"><Tag className="size-3.5" /> Etiquetas</p>
          <div className="flex flex-wrap gap-2">
            {[...new Set([...ETIQUETAS_SUGERIDAS, ...etiquetas])].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => alternarEtiqueta(t)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  etiquetas.includes(t) ? "border-naranja bg-naranja/15 text-naranja" : "border-linea text-niebla hover:text-white"
                }`}
              >
                {t}
              </button>
            ))}
            <input
              value={nuevaEtiqueta}
              onChange={(e) => setNuevaEtiqueta(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const t = nuevaEtiqueta.trim().toLowerCase();
                if (t && !etiquetas.includes(t)) setEtiquetas((x) => [...x, t].slice(0, 15));
                setNuevaEtiqueta("");
              }}
              placeholder="+ otra (Enter)"
              className="w-32 rounded-full border border-dashed border-linea bg-transparent px-3 py-1 text-base outline-none placeholder:text-niebla/60 focus:border-naranja sm:text-xs"
            />
          </div>
        </div>
      </section>

      {/* Diario por día */}
      <section className="card space-y-4 p-5 md:p-6">
        <h2 className="flex items-center gap-2 font-display text-2xl font-bold uppercase">
          <NotebookPen className="size-5 text-naranja" /> Diario
        </h2>
        <p className="-mt-2 text-xs text-niebla">Qué pasó cada día. Se muestra junto a las fotos de ese día.</p>
        <div className="space-y-2">
          {diasViaje.map((d, i) => (
            <details key={d} open={!!diario[d] || diasViaje.length === 1} className="group rounded-xl border border-linea">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
                <span className="font-display text-lg font-bold uppercase">Día {i + 1}</span>
                <span className="text-xs text-niebla">{fechaHoraFoto(`${d}T`, false)}</span>
                {diario[d] && <span className="ml-auto size-2 rounded-full bg-naranja" title="Tiene texto" />}
              </summary>
              <textarea
                value={diario[d] ?? ""}
                onChange={(e) => setDiario((x) => ({ ...x, [d]: e.target.value }))}
                rows={3}
                placeholder="Ruta, paisajes, gente, anécdotas…"
                className="block w-full resize-y rounded-b-xl border-t border-linea bg-transparent px-3 py-2.5 text-base outline-none placeholder:text-niebla/60 focus:bg-carbon sm:text-sm"
              />
            </details>
          ))}
        </div>
      </section>

      {/* Ruta */}
      <section className="card space-y-5 p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-2xl font-bold uppercase">
            <MapPinned className="size-5 text-naranja" /> Ruta
          </h2>
          {!verEditor && (
            <button type="button" onClick={() => setVerEditor(true)} className="btn-ghost">
              <MapPinned className="size-4" /> Marcar ruta en el mapa
            </button>
          )}
        </div>
        {verEditor ? (
          <EditorRutaLazy
            key={editorKey}
            inicial={rutaEditor}
            origen={origen}
            destino={destino}
            referencia={gpxPuntos}
            onChange={cambiarRuta}
          />
        ) : (
          <p className="text-sm text-niebla">
            Marcá las paradas en el mapa (o buscalas por nombre) y la ruta se calcula siguiendo las rutas. También podés
            subir el GPX real más abajo.
          </p>
        )}
      </section>

      {/* Kilómetros */}
      <section className="card space-y-5 p-5 md:p-6">
        <h2 className="flex items-center gap-2 font-display text-2xl font-bold uppercase">
          <Gauge className="size-5 text-naranja" /> Kilómetros
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="odometro_inicio">Odómetro salida</label>
            <input id="odometro_inicio" name="odometro_inicio" inputMode="numeric" value={odoIni} onChange={(e) => setOdoIni(e.target.value)} placeholder="12450" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="odometro_fin">Odómetro llegada</label>
            <input id="odometro_fin" name="odometro_fin" inputMode="numeric" value={odoFin} onChange={(e) => setOdoFin(e.target.value)} placeholder="13120" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="km">Km recorridos *</label>
            <input id="km" name="km" inputMode="decimal" value={kmTxt} onChange={(e) => setKmTxt(e.target.value)} placeholder="670" className="input font-semibold" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {kmOdometro !== null && String(kmOdometro) !== kmTxt && (
            <button type="button" onClick={() => setKmTxt(String(kmOdometro))} className="rounded-full border border-linea px-3 py-1 text-niebla hover:border-naranja hover:text-white">
              Usar odómetro: {kmOdometro} km
            </button>
          )}
          {gpxKm !== null && String(gpxKm) !== kmTxt && (
            <button type="button" onClick={() => setKmTxt(String(gpxKm))} className="rounded-full border border-linea px-3 py-1 text-niebla hover:border-naranja hover:text-white">
              Usar GPX: {gpxKm} km
            </button>
          )}
          {ruta && String(ruta.km) !== kmTxt && (
            <button type="button" onClick={() => setKmTxt(String(ruta.km))} className="rounded-full border border-linea px-3 py-1 text-niebla hover:border-naranja hover:text-white">
              Usar ruta marcada: {ruta.km} km
            </button>
          )}
        </div>

        {/* GPX */}
        <div className="space-y-3 border-t border-linea pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <label className="btn-ghost cursor-pointer">
              <FileUp className="size-4" />
              {gpx ? "Reemplazar recorrido" : "Subir GPX / KML / KMZ"}
              <input type="file" accept=".gpx,.kml,.kmz,application/gpx+xml,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz" className="hidden" onChange={(e) => e.target.files?.[0] && cargarGpx(e.target.files[0])} />
            </label>
            {gpx && (
              <button type="button" onClick={() => { descartarGpxBorrador(); setGpx(null); setGpxPuntos(undefined); setGpxKm(null); }} className="text-sm text-red-400 hover:underline">
                Quitar GPX
              </button>
            )}
            <span className="text-xs text-niebla">{gpxEstado || "GPX, KML o KMZ: de Strava, Wikiloc, Calimoto, Google Earth / Mis Mapas, etc."}</span>
          </div>
          {(gpxPuntos || gpx) && (
            <div className="h-64 overflow-hidden rounded-xl border border-linea">
              <MapaRutaLazy puntos={gpxPuntos} url={gpxPuntos ? undefined : gpx?.url} />
            </div>
          )}
        </div>
      </section>

      {/* Fotos */}
      <section className="card space-y-5 p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-2xl font-bold uppercase">
            <ImagePlus className="size-5 text-naranja" /> Fotos y videos
          </h2>
          <div className="flex items-center gap-3">
            {conFecha >= 2 && (
              <button type="button" onClick={ordenarPorFecha} className="btn-ghost px-3 py-1.5 text-xs">
                <CalendarArrowUp className="size-3.5" /> Ordenar por fecha
              </button>
            )}
            <span className="text-xs text-niebla">{fotos.length} · la primera es la portada</span>
          </div>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); agregarFotos(e.dataTransfer.files); }}
          onClick={() => inputFotos.current?.click()}
          className={`grid cursor-pointer place-items-center rounded-xl border-2 border-dashed px-4 py-10 text-center transition ${
            drag ? "border-naranja bg-naranja/5" : "border-linea hover:border-niebla"
          }`}
        >
          <div>
            <ImagePlus className="mx-auto size-9 text-niebla" strokeWidth={1.5} />
            <p className="mt-2 text-sm font-medium">Arrastrá fotos y videos o tocá para elegir</p>
            <p className="text-xs text-niebla">
              JPG, PNG, HEIC, MP4, MOV · calidad original · videos hasta {MAX_VIDEO_MB} MB
            </p>
          </div>
          <input
            ref={inputFotos}
            type="file"
            accept="image/*,.heic,.heif,video/*,.mov,.mp4"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files) agregarFotos(e.target.files); e.target.value = ""; }}
          />
        </div>

        <p className="text-xs text-niebla">
          En Android el navegador no puede leer la ubicación de las fotos (el sistema la oculta). Después de guardar, asignales el
          lugar desde <b>Pasaste por</b> en el viaje.
        </p>

        {/* Subidas en curso: un resumen (con cientos de fotos, una tarjeta por foto trababa el celular) */}
        {subidas.length > 0 && (
          <div className="space-y-2 rounded-xl border border-linea bg-grafito/60 p-3">
            {(() => {
              const enCurso = subidas.filter((s) => !s.error && !s.espera);
              const errores = subidas.filter((s) => s.error);
              const espera = subidas.filter((s) => s.espera);
              const pct = enCurso.length ? Math.round(enCurso.reduce((a, s) => a + s.progreso, 0) / enCurso.length) : 100;
              return (
                <>
                  {enCurso.length > 0 && (
                    <>
                      <p className="flex items-center gap-2 text-sm">
                        <LoaderCircle className="size-4 animate-spin text-naranja" />
                        Subiendo {enCurso.length} {enCurso.length === 1 ? "archivo" : "archivos"}… {pct}%
                        <span className="ml-auto text-xs text-niebla">{fotos.length} listas</span>
                      </p>
                      <div className="h-1.5 overflow-hidden rounded-full bg-black/50">
                        <div className="h-full bg-naranja transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </>
                  )}
                  {espera.length > 0 && (
                    <p className="flex items-center gap-2 text-sm text-amber-200">
                      <WifiOff className="size-4" /> {espera.length} {espera.length === 1 ? "foto espera" : "fotos esperan"} señal: se suben solas al volver.
                      <button
                        type="button"
                        onClick={() => {
                          espera.forEach((s) => borrarPendiente(s.key));
                          setSubidas((x) => x.filter((y) => !y.espera));
                        }}
                        className="ml-auto text-xs text-white/70 underline"
                      >
                        Quitar
                      </button>
                    </p>
                  )}
                  {errores.length > 0 && (
                    <div className="space-y-1">
                      <p className="flex items-center gap-2 text-sm text-red-300">
                        <CircleAlert className="size-4" /> {errores.length} no se {errores.length === 1 ? "pudo" : "pudieron"} subir
                        <button type="button" onClick={() => setSubidas((x) => x.filter((y) => !y.error))} className="ml-auto text-xs text-white/70 underline">
                          Descartar
                        </button>
                      </p>
                      <ul className="max-h-24 overflow-y-auto text-xs text-niebla">
                        {errores.map((s) => (
                          <li key={s.key} className="truncate">
                            {s.nombre}: {s.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {fotos.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-linea p-2.5">
            <img src={cldMiniatura(fotos[0], { w: 160, h: 160, crop: "fill" })} alt="" className="size-14 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold tracking-wider text-naranja uppercase">Portada</p>
              <p className="truncate text-xs text-niebla">La foto que se ve arriba del viaje y en la tarjeta para compartir</p>
            </div>
            <button type="button" onClick={() => setEligiendoPortada(true)} className="btn-ghost px-3 py-1.5 text-xs">
              <Star className="size-3.5" /> Cambiar portada
            </button>
          </div>
        )}

        {fotos.length > POR_PAGINA && (
          <Paginas pagina={paginaFotos} total={totalPaginas} onCambiar={setPaginaFotos} desde={inicioPagina + 1} hasta={Math.min(fotos.length, inicioPagina + POR_PAGINA)} de={fotos.length} />
        )}

        {fotos.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {fotos.slice(inicioPagina, inicioPagina + POR_PAGINA).map((f, k) => { const i = inicioPagina + k; return (
              <li
                key={f.public_id}
                // Reordenar arrastrando (en computadora; en el celular están las flechas)
                draggable
                onDragStart={(e) => {
                  setArrastrando(i);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/x-mv-foto", String(i));
                }}
                onDragOver={(e) => {
                  if (arrastrando === null) return;
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  if (arrastrando === null) return;
                  e.preventDefault();
                  e.stopPropagation();
                  moverA(arrastrando, i);
                  setArrastrando(null);
                }}
                onDragEnd={() => setArrastrando(null)}
                className={`overflow-hidden rounded-xl border bg-grafito transition ${
                  arrastrando === i ? "border-naranja opacity-40" : "border-linea"
                } ${arrastrando !== null ? "cursor-grabbing" : "cursor-grab"}`}
              >
                <div className="relative aspect-square">
                  <img src={cldMiniatura(f, { w: 400, h: 400, crop: "fill" })} alt="" draggable={false} className="size-full object-cover" />
                  <button
                    type="button"
                    onClick={() => alternarFavorita(i)}
                    className={`absolute bottom-11 left-1.5 grid size-7 place-items-center rounded-md bg-black/60 ${f.favorita ? "text-red-400" : "text-white/70"}`}
                    title={f.favorita ? "Quitar de favoritas" : "Marcar como favorita"}
                  >
                    <Heart className={`size-3.5 ${f.favorita ? "fill-current" : ""}`} />
                  </button>
                  {(f.tomada_en || f.lat != null) && (
                    <span className="absolute right-1.5 bottom-11 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-1 text-[10px] text-white/80">
                      {f.lat != null && <MapPin className="size-3" />}
                      {f.tomada_en && fechaHoraFoto(f.tomada_en, false)}
                    </span>
                  )}
                  {f.tipo === "video" && (
                    <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">
                      <Play className="size-2.5 fill-current" /> {duracionTxt(f.duracion)}
                    </span>
                  )}
                  {i === 0 && (
                    <span className="absolute top-2 left-2 rounded-full bg-naranja px-2 py-0.5 text-[10px] font-bold text-black uppercase">Portada</span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-gradient-to-t from-black/80 to-transparent p-1.5 pt-6">
                    <div className="flex gap-1">
                      <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="grid size-7 place-items-center rounded-md bg-black/60 disabled:opacity-30" title="Mover antes"><ChevronLeft className="size-4" /></button>
                      <button type="button" onClick={() => mover(i, 1)} disabled={i === fotos.length - 1} className="grid size-7 place-items-center rounded-md bg-black/60 disabled:opacity-30" title="Mover después"><ChevronRight className="size-4" /></button>
                    </div>
                    <div className="flex gap-1">
                      {i !== 0 && (
                        <button type="button" onClick={() => portada(i)} className="grid size-7 place-items-center rounded-md bg-black/60" title="Hacer portada"><Star className="size-3.5" /></button>
                      )}
                      <button type="button" onClick={() => quitarFoto(i)} className="grid size-7 place-items-center rounded-md bg-black/60 text-red-400" title="Quitar"><X className="size-4" /></button>
                    </div>
                  </div>
                </div>
                <input
                  value={f.caption}
                  onChange={(e) => setFotos((x) => x.map((y, j) => (j === i ? { ...y, caption: e.target.value } : y)))}
                  placeholder="Descripción…"
                  className="w-full border-t border-linea bg-transparent px-2.5 py-2 text-xs outline-none placeholder:text-niebla/60 focus:bg-carbon"
                />
                <select
                  value={f.categoria ?? ""}
                  onChange={(e) =>
                    setFotos((x) => x.map((y, j) => (j === i ? { ...y, categoria: (e.target.value || null) as FotoDraft["categoria"] } : y)))
                  }
                  aria-label="Categoría"
                  className={`w-full border-t border-linea bg-transparent px-2 py-1.5 text-xs outline-none focus:bg-carbon ${f.categoria ? "text-white" : "text-niebla/70"}`}
                >
                  <option value="">Sin categoría</option>
                  {CATEGORIAS.map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </li>
            ); })}
          </ul>
        )}

        {fotos.length > POR_PAGINA && (
          <Paginas pagina={paginaFotos} total={totalPaginas} onCambiar={setPaginaFotos} desde={inicioPagina + 1} hasta={Math.min(fotos.length, inicioPagina + POR_PAGINA)} de={fotos.length} />
        )}

        {eligiendoPortada && (
          <ElegirPortada
            fotos={fotos}
            onElegir={(i) => {
              if (i > 0) portada(i);
              setEligiendoPortada(false);
              setPaginaFotos(0);
            }}
            onCerrar={() => setEligiendoPortada(false)}
          />
        )}
      </section>

      {estado?.error && (
        <div ref={errorRef} role="alert" className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-red-400" />
          <p>{estado.error}</p>
        </div>
      )}

      {/* Barra de acciones: queda pegada abajo en el celular para no tener que bajar hasta el final */}
      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 -mx-4 flex items-center justify-end gap-3 border-t border-linea bg-asfalto/90 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <Link
          href={viaje ? `/viajes/${viaje.id}` : "/viajes"}
          onClick={(e) => {
            if ((sucio || subiendo) && !window.confirm("Hay cambios sin guardar. ¿Salir igual?")) e.preventDefault();
          }}
          className="btn-ghost"
        >
          Cancelar
        </Link>
        <GuardarBtn pending={pendiente || !!estado?.ir} bloqueado={subiendo} esperando={subidas.some((x) => x.espera)} editando={!!viaje} />
      </div>
    </form>
  );
}

/** Navegación entre páginas de fotos: ‹ 1 2 3 … › */
function Paginas({
  pagina,
  total,
  onCambiar,
  desde,
  hasta,
  de,
}: {
  pagina: number;
  total: number;
  onCambiar: (p: number) => void;
  desde: number;
  hasta: number;
  de: number;
}) {
  const actual = Math.min(pagina, total - 1);
  // Números visibles: primera, última y las vecinas de la actual
  const nums = [...new Set([0, actual - 1, actual, actual + 1, total - 1])].filter((n) => n >= 0 && n < total).sort((a, b) => a - b);
  const btn = "grid h-8 min-w-8 place-items-center rounded-lg px-2 text-xs font-semibold";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-auto text-xs text-niebla">
        {desde}–{hasta} de {de}
      </span>
      <button type="button" disabled={actual === 0} onClick={() => onCambiar(actual - 1)} className={`${btn} border border-linea disabled:opacity-30`} aria-label="Página anterior">
        <ChevronLeft className="size-4" />
      </button>
      {nums.map((n, i) => (
        <span key={n} className="flex items-center gap-1.5">
          {i > 0 && n - nums[i - 1] > 1 && <span className="text-xs text-niebla">…</span>}
          <button
            type="button"
            onClick={() => onCambiar(n)}
            aria-current={n === actual ? "page" : undefined}
            className={`${btn} ${n === actual ? "bg-naranja text-black" : "border border-linea text-niebla hover:text-white"}`}
          >
            {n + 1}
          </button>
        </span>
      ))}
      <button type="button" disabled={actual >= total - 1} onClick={() => onCambiar(actual + 1)} className={`${btn} border border-linea disabled:opacity-30`} aria-label="Página siguiente">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

/** Elegir la portada tocando una foto (miniaturas chicas, de a 60) */
function ElegirPortada({ fotos, onElegir, onCerrar }: { fotos: FotoDraft[]; onElegir: (i: number) => void; onCerrar: () => void }) {
  const [hasta, setHasta] = useState(60);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 sm:items-center" onClick={onCerrar}>
      <div className="card flex max-h-[88dvh] w-full max-w-2xl flex-col gap-3 rounded-b-none p-4 sm:rounded-b-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-2xl font-bold uppercase">Elegí la portada</h2>
          <button type="button" onClick={onCerrar} className="btn-ghost ml-auto px-2.5 py-1.5" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>
        <ul className="grid min-h-0 grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-5">
          {fotos.slice(0, hasta).map((f, i) => (
            <li key={f.public_id}>
              <button
                type="button"
                onClick={() => onElegir(i)}
                className={`relative block aspect-square w-full overflow-hidden rounded-lg ${i === 0 ? "ring-3 ring-naranja" : "hover:opacity-80"}`}
              >
                <img src={cldMiniatura(f, { w: 200, h: 200, crop: "fill" })} alt="" loading="lazy" className="size-full object-cover" />
                {i === 0 && <span className="absolute top-1 left-1 rounded-full bg-naranja px-1.5 py-0.5 text-[9px] font-bold text-black uppercase">Actual</span>}
              </button>
            </li>
          ))}
          {hasta < fotos.length && (
            <li className="col-span-full">
              <button type="button" onClick={() => setHasta((h) => h + 60)} className="btn-ghost w-full py-2 text-sm">
                Ver más ({fotos.length - hasta})
              </button>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
