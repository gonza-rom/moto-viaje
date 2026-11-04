import type { TipoMedio } from "./cld";
import type { Ruta } from "./ruta";

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
};
