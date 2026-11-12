-- Moto Viajes — jornadas de trabajo (Uber) (12/11/2026)
-- Se puede correr más de una vez.

create table if not exists public.jornadas (
  id                  uuid primary key default gen_random_uuid(),
  moto_id             uuid references public.motos(id) on delete set null,
  fecha               date not null default current_date,
  inicio              timestamptz,
  fin                 timestamptz,
  km                  numeric(8,1) not null default 0,
  minutos_total       int,
  minutos_movimiento  int,
  ingresos            numeric(12,2),
  propinas            numeric(12,2),
  viajes              int,
  -- recorrido simplificado [[lat, lng], …] (para el mapa y el mapa de zonas)
  recorrido           jsonb,
  notas               text,
  created_at          timestamptz not null default now()
);
create index if not exists jornadas_fecha_idx on public.jornadas (fecha desc);
alter table public.jornadas enable row level security;

-- Gastos de una jornada (nafta, comida, repuestos…)
alter table public.gastos add column if not exists jornada_id uuid references public.jornadas(id) on delete cascade;
create index if not exists gastos_jornada_idx on public.gastos (jornada_id);
