-- Moto Viajes — esquema
-- Ejecutar en Supabase > SQL Editor

create extension if not exists "pgcrypto";

create table if not exists public.motos (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  modelo        text,
  anio          int,
  km_iniciales  int not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.viajes (
  id               uuid primary key default gen_random_uuid(),
  titulo           text not null,
  fecha_inicio     date not null,
  fecha_fin        date,
  origen           text,
  destino          text,
  km               numeric(8,1) not null default 0,
  odometro_inicio  int,
  odometro_fin     int,
  moto_id          uuid references public.motos(id) on delete set null,
  notas            text,
  gpx_public_id    text,
  gpx_url          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.fotos (
  id          uuid primary key default gen_random_uuid(),
  viaje_id    uuid not null references public.viajes(id) on delete cascade,
  public_id   text not null,
  width       int,
  height      int,
  caption     text,
  orden       int not null default 0,
  created_at  timestamptz not null default now()
);

-- Ruta trazada a mano en el mapa: { modo, paradas: [{lat,lng,nombre?}], trazo: [[lat,lng]...], km }
alter table public.viajes add column if not exists ruta jsonb;

-- Fotos y videos comparten tabla. tipo = resource_type de Cloudinary.
-- (Idempotente: sirve también como migración si la tabla ya existía.)
alter table public.fotos add column if not exists tipo text not null default 'image';
alter table public.fotos add column if not exists duracion numeric(8,2);
alter table public.fotos drop constraint if exists fotos_tipo_check;
alter table public.fotos add constraint fotos_tipo_check check (tipo in ('image', 'video'));

create index if not exists viajes_fecha_idx on public.viajes (fecha_inicio desc);
create index if not exists viajes_moto_idx  on public.viajes (moto_id);
create index if not exists fotos_viaje_idx  on public.fotos (viaje_id, orden);

-- updated_at automático
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists viajes_updated_at on public.viajes;
create trigger viajes_updated_at before update on public.viajes
  for each row execute function public.set_updated_at();

-- RLS activado SIN políticas: la anon key no puede leer ni escribir nada.
-- La app accede solo desde el servidor con la service role key (que saltea RLS).
alter table public.motos  enable row level security;
alter table public.viajes enable row level security;
alter table public.fotos  enable row level security;
