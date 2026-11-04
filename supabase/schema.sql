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

-- Datos de la foto (EXIF): cuándo y dónde se sacó, y favoritas.
-- tomada_en sin zona horaria: es la hora local de la cámara.
alter table public.fotos add column if not exists tomada_en timestamp;
alter table public.fotos add column if not exists lat double precision;
alter table public.fotos add column if not exists lng double precision;
alter table public.fotos add column if not exists favorita boolean not null default false;
create index if not exists fotos_favorita_idx on public.fotos (favorita) where favorita;

-- Intentos de login fallidos (límite anti fuerza bruta)
create table if not exists public.login_intentos (
  id      bigint generated always as identity primary key,
  ip      text not null,
  creado  timestamptz not null default now()
);
create index if not exists login_intentos_creado_idx on public.login_intentos (creado desc);
alter table public.login_intentos enable row level security;

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

-- ───────── Mejoras 04/11/2026 (también en supabase/migracion-2026-11-04.sql) ─────────

-- Gastos y cargas de nafta (pueden ser de un viaje o sueltas de una moto)
create table if not exists public.gastos (
  id          uuid primary key default gen_random_uuid(),
  viaje_id    uuid references public.viajes(id) on delete cascade,
  moto_id     uuid references public.motos(id) on delete set null,
  fecha       date not null default current_date,
  tipo        text not null default 'nafta'
              check (tipo in ('nafta', 'peaje', 'comida', 'alojamiento', 'repuestos', 'otro')),
  monto       numeric(12,2) not null default 0,
  litros      numeric(7,2),
  odometro    int,
  lleno       boolean not null default true,
  lugar       text,
  notas       text,
  created_at  timestamptz not null default now()
);
create index if not exists gastos_viaje_idx on public.gastos (viaje_id);
create index if not exists gastos_moto_idx  on public.gastos (moto_id, fecha);
alter table public.gastos enable row level security;

-- Mantenimiento de cada moto (service, aceite, cubiertas…) con intervalo para el próximo aviso
create table if not exists public.mantenimientos (
  id          uuid primary key default gen_random_uuid(),
  moto_id     uuid not null references public.motos(id) on delete cascade,
  tipo        text not null,
  fecha       date not null default current_date,
  odometro    int,
  costo       numeric(12,2),
  cada_km     int,
  cada_meses  int,
  notas       text,
  created_at  timestamptz not null default now()
);
create index if not exists mantenimientos_moto_idx on public.mantenimientos (moto_id, tipo, fecha desc);
alter table public.mantenimientos enable row level security;

-- Viajes: link para compartir, diario por día, etiquetas y perfil de altura
alter table public.viajes add column if not exists compartir_token text unique;
alter table public.viajes add column if not exists diario jsonb;
alter table public.viajes add column if not exists etiquetas text[] not null default '{}';
alter table public.viajes add column if not exists altimetria jsonb;
