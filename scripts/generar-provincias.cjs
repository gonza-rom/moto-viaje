// Genera src/data/provincias-ar.json: contornos simplificados de las 24 provincias como paths SVG.
// Fuente: IGN vía geoBoundaries (gbHumanitarian ARG ADM1, CC BY 3.0 IGO).
const fs = require("fs");
const path = require("path");
const [entrada, salida] = process.argv.slice(2);
const j = JSON.parse(fs.readFileSync(entrada, "utf8"));

const ANCHO = 400;
const k = Math.cos((-38 * Math.PI) / 180); // equirectangular centrada en la latitud media de Argentina
const proy = ([lon, lat]) => [lon * k, -lat];

// Límites de todo el país (proyectado)
let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
for (const f of j.features) {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const p of polys) for (const c of p[0]) {
    const [x, y] = proy(c);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
}
const esc = ANCHO / (x1 - x0);
const ALTO = Math.ceil((y1 - y0) * esc);
const aView = ([x, y]) => [(x - x0) * esc, (y - y0) * esc];

function dp(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const pila = [[0, pts.length - 1]];
  while (pila.length) {
    const [a, b] = pila.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = (ax + t * dx - px) ** 2 + (ay + t * dy - py) ** 2;
      if (d > max) { max = d; idx = i; }
    }
    if (idx >= 0 && max > tol * tol) { keep[idx] = 1; pila.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const area = (r) => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y; }, 0) / 2);

const NOMBRES = { "Ciudad de Buenos Aires": "Ciudad Autónoma de Buenos Aires", "Río negro": "Río Negro" };
const salidaJson = { ancho: ANCHO, alto: ALTO, fuente: "IGN vía geoBoundaries (CC BY 3.0 IGO)", proy: { k, x0, y0, esc }, provincias: [] };
let totalPts = 0;
for (const f of j.features) {
  const nombre = NOMBRES[f.properties.shapeName] ?? f.properties.shapeName;
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const anillos = polys.map((p) => p[0].map(proy).map(aView)).map((r) => ({ r, a: area(r) })).sort((a, b) => b.a - a.a);
  const esChica = nombre === "Ciudad Autónoma de Buenos Aires";
  const elegidos = anillos.filter((x, i) => i === 0 || x.a > 4); // la principal + islas visibles
  let d = "";
  let superficie = 0;
  for (const { r, a } of elegidos) {
    const s = dp(r, esChica ? 0.15 : 0.6);
    if (s.length < 3) continue;
    totalPts += s.length;
    superficie += a;
    d += "M" + s.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L") + "Z";
  }
  // Centro aproximado (del anillo principal) para la etiqueta
  const r0 = anillos[0].r;
  const cx = r0.reduce((s, p) => s + p[0], 0) / r0.length;
  const cy = r0.reduce((s, p) => s + p[1], 0) / r0.length;
  salidaJson.provincias.push({ nombre, d, superficie: Math.round(superficie), cx: Math.round(cx), cy: Math.round(cy) });
}
salidaJson.provincias.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(salida, JSON.stringify(salidaJson));
console.log(`${salidaJson.provincias.length} provincias · ${totalPts} puntos · ${Math.round(fs.statSync(salida).size / 1024)} KB · viewBox 0 0 ${ANCHO} ${ALTO}`);
