// Video del viaje para redes, generado en el navegador: se dibuja cuadro por cuadro en un <canvas>
// (mapa satelital, la ruta que avanza, las fotos elegidas y un cierre con los datos) y se graba con
// MediaRecorder. Solo navegador.

import type { Punto } from "./gpx";
import { kmAcumulados, reducir } from "./recorrido";

export type FotoVideo = { url: string; km: number; texto?: string };
export type OpcionesVideo = {
  puntos: Punto[];
  fotos: FotoVideo[]; // ordenadas por km
  lugares: { nombre: string; km: number }[];
  titulo: string;
  subtitulo: string;
  datos: { valor: string; label: string }[];
  formato: "vertical" | "cuadrado";
};
export type ResultadoVideo = { blob: Blob; ext: "mp4" | "webm" };

const NARANJA = "#ff6a1a";
const FPS = 30;
const TILE = 256;
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const TILES = [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`];
const FUENTE = '"Barlow Condensed", "Inter Variable", sans-serif';

/** Formato de grabación: MP4 si el navegador puede (Instagram/WhatsApp lo prefieren), si no WebM */
export function formatoGrabacion(): { mime: string; ext: "mp4" | "webm" } | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const mime of ["video/mp4;codecs=avc1.42E01F", "video/mp4;codecs=avc1", "video/mp4"])
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext: "mp4" };
  for (const mime of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"])
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext: "webm" };
  return null;
}

/** Web Mercator: [lat, lng] → píxeles del mundo en el zoom z */
function mundo([lat, lng]: Punto, z: number): [number, number] {
  const s = TILE * 2 ** z;
  const sin = Math.sin((lat * Math.PI) / 180);
  return [((lng + 180) / 360) * s, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s];
}

function cargarImagen(url: string): Promise<HTMLImageElement | null> {
  return new Promise((ok) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = url;
  });
}

/** Dibuja la imagen cubriendo el rectángulo (como object-fit: cover), con zoom suave opcional */
function cubrir(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, zoom = 1) {
  const r = Math.max(w / img.width, h / img.height) * zoom;
  const iw = img.width * r;
  const ih = img.height * r;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

const suave = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

type Tramo =
  | { tipo: "intro"; dur: number }
  | { tipo: "viaje"; dur: number; km0: number; km1: number }
  | { tipo: "foto"; dur: number; i: number }
  | { tipo: "cierre"; dur: number };

export async function grabarVideo(op: OpcionesVideo, onProgreso: (p: number, fase: string) => void): Promise<ResultadoVideo> {
  const fmt = formatoGrabacion();
  if (!fmt) throw new Error("Este navegador no puede grabar video. Probá con Chrome.");
  const W = 1080;
  const H = op.formato === "vertical" ? 1920 : 1080;
  const vertical = op.formato === "vertical";

  onProgreso(0, "Preparando el mapa…");
  await document.fonts.load(`700 60px ${FUENTE}`).catch(() => {});

  /* Recorrido en píxeles: zoom entero que entra en la caja + escala fina */
  const puntos = reducir(op.puntos, 1500);
  const acum = kmAcumulados(puntos);
  const total = acum[acum.length - 1] || 1;
  const caja = { w: W * 0.82, h: vertical ? H * 0.5 : H * 0.62, cx: W / 2, cy: vertical ? H * 0.4 : H * 0.47 };
  const p0 = puntos.map((p) => mundo(p, 0));
  const xs = p0.map((p) => p[0]);
  const ys = p0.map((p) => p[1]);
  const [ancho0, alto0] = [Math.max(...xs) - Math.min(...xs) || 1e-6, Math.max(...ys) - Math.min(...ys) || 1e-6];
  const z = Math.max(3, Math.min(13, Math.floor(Math.log2(Math.min(caja.w / ancho0, caja.h / alto0)))));
  const f = Math.min(caja.w / (ancho0 * 2 ** z), caja.h / (alto0 * 2 ** z), 2);
  const pz = puntos.map((p) => mundo(p, z));
  const cxMundo = (Math.min(...pz.map((p) => p[0])) + Math.max(...pz.map((p) => p[0]))) / 2;
  const cyMundo = (Math.min(...pz.map((p) => p[1])) + Math.max(...pz.map((p) => p[1]))) / 2;
  const aCanvas = ([x, y]: [number, number]): [number, number] => [(x - cxMundo) * f + caja.cx, (y - cyMundo) * f + caja.cy];
  const linea = pz.map(aCanvas);

  /* Fondo: teselas satelitales + nombres, oscurecido */
  const fondo = document.createElement("canvas");
  fondo.width = W;
  fondo.height = H;
  const fx = fondo.getContext("2d")!;
  fx.fillStyle = "#101214";
  fx.fillRect(0, 0, W, H);
  const tx0 = Math.floor((cxMundo - caja.cx / f) / TILE);
  const tx1 = Math.floor((cxMundo + (W - caja.cx) / f) / TILE);
  const ty0 = Math.max(0, Math.floor((cyMundo - caja.cy / f) / TILE));
  const ty1 = Math.min(2 ** z - 1, Math.floor((cyMundo + (H - caja.cy) / f) / TILE));
  for (const plantilla of TILES) {
    const pedidos: Promise<void>[] = [];
    for (let tx = tx0; tx <= tx1; tx++)
      for (let ty = ty0; ty <= ty1; ty++) {
        const n = 2 ** z;
        const url = plantilla.replace("{z}", String(z)).replace("{x}", String(((tx % n) + n) % n)).replace("{y}", String(ty));
        pedidos.push(
          cargarImagen(url).then((img) => {
            if (!img) return;
            const [x, y] = aCanvas([tx * TILE, ty * TILE]);
            fx.drawImage(img, x, y, TILE * f + 1, TILE * f + 1);
          })
        );
      }
    await Promise.all(pedidos);
  }
  fx.fillStyle = "rgba(8,10,12,0.42)";
  fx.fillRect(0, 0, W, H);
  // Degradés arriba y abajo para que se lean los textos
  for (const [y0, y1, a, b] of [
    [0, H * 0.22, 0.75, 0],
    [H * 0.62, H, 0, 0.85],
  ] as const) {
    const g = fx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, `rgba(8,10,12,${a})`);
    g.addColorStop(1, `rgba(8,10,12,${b})`);
    fx.fillStyle = g;
    fx.fillRect(0, y0, W, y1 - y0);
  }

  onProgreso(0, "Cargando las fotos…");
  const fotos = (await Promise.all(op.fotos.map(async (x) => ({ ...x, img: await cargarImagen(x.url) })))).filter((x) => x.img);

  /* Guion: intro → viaje (cortado por las fotos) → cierre */
  const durViaje = Math.min(22, Math.max(10, 8 + total / 80));
  const DUR_FOTO = 2.4;
  const tramos: Tramo[] = [{ tipo: "intro", dur: 2.6 }];
  let kmPrev = 0;
  fotos.forEach((x, i) => {
    const km = Math.min(total, Math.max(kmPrev, x.km));
    if (km > kmPrev) tramos.push({ tipo: "viaje", dur: ((km - kmPrev) / total) * durViaje, km0: kmPrev, km1: km });
    tramos.push({ tipo: "foto", dur: DUR_FOTO, i });
    kmPrev = km;
  });
  if (kmPrev < total) tramos.push({ tipo: "viaje", dur: ((total - kmPrev) / total) * durViaje, km0: kmPrev, km1: total });
  tramos.push({ tipo: "cierre", dur: 4 });
  const duracion = tramos.reduce((s, t) => s + t.dur, 0);

  /* Canvas final */
  const lienzo = document.createElement("canvas");
  lienzo.width = W;
  lienzo.height = H;
  const ctx = lienzo.getContext("2d")!;

  const indiceEn = (km: number) => {
    let lo = 0;
    let hi = acum.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (acum[m] < km) lo = m + 1;
      else hi = m;
    }
    return Math.max(1, lo);
  };
  const puntoEn = (km: number): [number, number] => {
    const i = indiceEn(km);
    const t = Math.min(1, Math.max(0, (km - acum[i - 1]) / (acum[i] - acum[i - 1] || 1)));
    const [a, b] = [linea[i - 1], linea[i]];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };

  function trazar(hasta: number) {
    // ruta completa tenue
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.setLineDash([10, 14]);
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    linea.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.setLineDash([]);
    if (hasta <= 0) return;
    const i = indiceEn(hasta);
    const cabeza = puntoEn(hasta);
    const hecho = [...linea.slice(0, i), cabeza];
    for (const [ancho, color] of [
      [16, "rgba(0,0,0,0.45)"],
      [9, NARANJA],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = ancho;
      ctx.beginPath();
      hecho.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    // la moto
    ctx.fillStyle = NARANJA;
    ctx.strokeStyle = "white";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cabeza[0], cabeza[1], 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function texto(t: string, x: number, y: number, size: number, opts: { color?: string; peso?: number; alinear?: CanvasTextAlign; alfa?: number; max?: number } = {}) {
    ctx.globalAlpha = opts.alfa ?? 1;
    ctx.font = `${opts.peso ?? 700} ${size}px ${FUENTE}`;
    ctx.fillStyle = opts.color ?? "white";
    ctx.textAlign = opts.alinear ?? "left";
    ctx.textBaseline = "alphabetic";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 12;
    ctx.fillText(t, x, y, opts.max);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  /** Título en varias líneas (corta por palabras) */
  function titulo(t: string, y: number, size: number, alfa: number) {
    ctx.font = `700 ${size}px ${FUENTE}`;
    const palabras = t.toUpperCase().split(/\s+/);
    const lineas: string[] = [];
    let actual = "";
    for (const p of palabras) {
      const prueba = actual ? `${actual} ${p}` : p;
      if (ctx.measureText(prueba).width > W - 140 && actual) {
        lineas.push(actual);
        actual = p;
      } else actual = prueba;
    }
    if (actual) lineas.push(actual);
    lineas.slice(0, 3).forEach((l, i) => texto(l, 70, y + i * size * 0.95, size, { alfa }));
    return y + Math.min(3, lineas.length) * size * 0.95;
  }

  function hud(km: number) {
    const lugar = [...op.lugares].reverse().find((l) => l.km <= km + 0.5);
    texto(`${Math.round(km).toLocaleString("es-AR")} km`, 70, vertical ? 170 : 120, vertical ? 92 : 76);
    if (lugar) texto(lugar.nombre, 70, vertical ? 225 : 165, vertical ? 42 : 36, { peso: 500, color: "rgba(255,255,255,0.85)", max: W - 140 });
  }

  function cuadro(t: number) {
    ctx.drawImage(fondo, 0, 0);
    let t0 = 0;
    let tramo = tramos[tramos.length - 1];
    for (const x of tramos) {
      if (t < t0 + x.dur) {
        tramo = x;
        break;
      }
      t0 += x.dur;
    }
    const local = Math.min(1, (t - t0) / tramo.dur);

    if (tramo.tipo === "intro") {
      trazar(0);
      const a = suave(local * 2.2);
      texto("MIS VIAJES EN MOTO", 70, vertical ? 150 : 110, 34, { color: NARANJA, alfa: a });
      const fin = titulo(op.titulo, vertical ? 245 : 190, vertical ? 96 : 80, a);
      texto(op.subtitulo, 70, fin + 10, 40, { peso: 500, color: "rgba(255,255,255,0.8)", alfa: a });
      return;
    }
    if (tramo.tipo === "viaje") {
      const km = tramo.km0 + (tramo.km1 - tramo.km0) * local;
      trazar(km);
      hud(km);
      return;
    }
    if (tramo.tipo === "foto") {
      const x = fotos[tramo.i];
      trazar(Math.min(total, x.km));
      hud(x.km);
      const entra = suave(local / 0.15);
      const sale = 1 - suave((local - 0.85) / 0.15);
      const a = Math.min(entra, sale);
      // tarjeta con la foto
      const cw = vertical ? W - 120 : W * 0.62;
      const ch = vertical ? H * 0.42 : H * 0.66;
      const cx = (W - cw) / 2;
      const cy = vertical ? H * 0.5 + (1 - entra) * 60 : (H - ch) / 2 + (1 - entra) * 40;
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(cx, cy, cw, ch, 28);
      ctx.clip();
      cubrir(ctx, x.img!, cx, cy, cw, ch, 1 + local * 0.06); // zoom lento
      ctx.restore();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.roundRect(cx, cy, cw, ch, 28);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (x.texto) texto(x.texto, W / 2, cy + ch + 64, 40, { peso: 500, alinear: "center", alfa: a, max: W - 120 });
      return;
    }
    // cierre: ruta completa + datos
    trazar(total);
    const a = suave(local * 2.5);
    ctx.globalAlpha = a * 0.55;
    ctx.fillStyle = "#08090b";
    ctx.fillRect(0, vertical ? H * 0.64 : H * 0.6, W, H);
    ctx.globalAlpha = 1;
    const fin = titulo(op.titulo, vertical ? H * 0.71 : H * 0.69, vertical ? 70 : 56, a);
    const cols = Math.min(op.datos.length, vertical ? 2 : 4);
    op.datos.slice(0, vertical ? 4 : 4).forEach((d, i) => {
      const col = i % cols;
      const fila = Math.floor(i / cols);
      const x0 = 70 + col * ((W - 140) / cols);
      const y0 = fin + 80 + fila * 150;
      texto(d.valor, x0, y0, vertical ? 84 : 64, { color: NARANJA, alfa: a });
      texto(d.label.toUpperCase(), x0, y0 + 44, 30, { peso: 500, color: "rgba(255,255,255,0.75)", alfa: a });
    });
    texto("Mis viajes en moto", W - 70, H - 50, 30, { peso: 500, alinear: "right", color: "rgba(255,255,255,0.5)", alfa: a });
  }

  /* Grabar en tiempo real */
  cuadro(0);
  const stream = lienzo.captureStream(FPS);
  const rec = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: 5_000_000 });
  const partes: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && partes.push(e.data);
  const listo = new Promise<void>((ok) => (rec.onstop = () => ok()));
  rec.start(500);
  const inicio = performance.now();
  await new Promise<void>((ok) => {
    const paso = () => {
      const t = (performance.now() - inicio) / 1000;
      cuadro(Math.min(t, duracion));
      onProgreso(Math.min(1, t / duracion), "Grabando el video…");
      if (t >= duracion + 0.3) return ok();
      requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  });
  rec.stop();
  await listo;
  stream.getTracks().forEach((t) => t.stop());
  onProgreso(1, "Listo");
  return { blob: new Blob(partes, { type: fmt.mime.split(";")[0] }), ext: fmt.ext };
}
