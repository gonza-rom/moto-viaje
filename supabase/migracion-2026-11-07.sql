-- Moto Viajes — planes guardados y álbum compartido (07/11/2026)
-- Se puede correr más de una vez.

-- Rutas planificadas (planificador). viaje_id: el viaje que se hizo con este plan (para comparar)
create table if not exists public.planes (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  ruta        jsonb not null,
  km          numeric(8,1) not null default 0,
  consumo     numeric(5,1),
  tanque      numeric(5,1),
  precio      numeric(10,2),
  reserva     int not null default 15,
  litros      numeric(7,1),
  costo       numeric(12,2),
  viaje_id    uuid references public.viajes(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists planes_viaje_idx on public.planes (viaje_id);
alter table public.planes enable row level security;

-- Álbum compartido: link para que acompañantes suban fotos al viaje sin la contraseña
alter table public.viajes add column if not exists album_token text unique;
-- Quién subió la foto desde el álbum compartido (null = vos)
alter table public.fotos add column if not exists subida_por text;
