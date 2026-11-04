-- Moto Viajes — mejoras del 04/11/2026 (gastos, mantenimiento, compartir, diario, etiquetas, altimetría)
-- Pegar entero en Supabase > SQL Editor > Run. Se puede correr más de una vez.

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
