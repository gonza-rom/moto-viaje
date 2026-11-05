import type { TipoMedio } from "./cld";
import type { Ruta } from "./ruta";
import type { Categoria } from "./categorias";

export type Moto = {
  id: string;
  nombre: string;
  modelo: string | null;
  anio: number | null;
  km_iniciales: number;
  created_at: string;
};

export type Foto = {
  id: string;
  viaje_id: string;
  tipo: TipoMedio;
  public_id: string;
  width: number | null;
  height: number | null;
  duracion: number | null;
  caption: string | null;
  orden: number;
  /** Fecha/hora local en que se sacó (EXIF), "YYYY-MM-DDTHH:mm:ss" */
  tomada_en: string | null;
  lat: number | null;
  lng: number | null;
  favorita: boolean;
  categoria: Categoria | null;
  /** Lugar detectado por el GPS (null = falta detectar, "" = sin resultado) */
  lugar: string | null;
  provincia: string | null;
  pais: string | null;
};

/** Foto con datos de su viaje (galería general) */
export type FotoConViaje = Foto & {
  viajes: Pick<Viaje, "id" | "titulo" | "fecha_inicio" | "fecha_fin" | "moto_id"> | null;
};

export type Viaje = {
  id: string;
  titulo: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  origen: string | null;
  destino: string | null;
  km: number;
  odometro_inicio: number | null;
  odometro_fin: number | null;
  moto_id: string | null;
  notas: string | null;
  gpx_public_id: string | null;
  gpx_url: string | null;
  ruta: Ruta | null;
  /** Token del link público de solo lectura (null = no compartido) */
  compartir_token: string | null;
  /** Diario por día: { "2026-10-10": "texto" } */
  diario: Record<string, string> | null;
  etiquetas: string[];
  altimetria: Altimetria | null;
  created_at: string;
};

/** Perfil de altura del recorrido (calculado una vez y guardado) */
export type Altimetria = {
  /** [km acumulado, metros] */
  puntos: [number, number][];
  max: number;
  min: number;
  subida: number;
  bajada: number;
};

export type TipoGasto = "nafta" | "peaje" | "comida" | "alojamiento" | "repuestos" | "otro";

export type Gasto = {
  id: string;
  viaje_id: string | null;
  moto_id: string | null;
  fecha: string;
  tipo: TipoGasto;
  monto: number;
  litros: number | null;
  odometro: number | null;
  lleno: boolean;
  lugar: string | null;
  notas: string | null;
  created_at: string;
};

export type Mantenimiento = {
  id: string;
  moto_id: string;
  tipo: string;
  fecha: string;
  odometro: number | null;
  costo: number | null;
  cada_km: number | null;
  cada_meses: number | null;
  notas: string | null;
  created_at: string;
};

export type ViajeConRelaciones = Viaje & {
  motos: Pick<Moto, "id" | "nombre"> | null;
  fotos: Foto[];
};

/** Foto o video en el formulario (puede no existir aún en la DB) */
export type FotoDraft = {
  id?: string;
  tipo: TipoMedio;
  public_id: string;
  width: number | null;
  height: number | null;
  duracion: number | null;
  caption: string;
  tomada_en: string | null;
  lat: number | null;
  lng: number | null;
  favorita: boolean;
  categoria: Categoria | null;
};
