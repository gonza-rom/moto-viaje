-- Moto Viajes — categorías y lugares de las fotos (05/11/2026)
-- Se puede correr más de una vez.

alter table public.fotos add column if not exists categoria text;
alter table public.fotos drop constraint if exists fotos_categoria_check;
alter table public.fotos add constraint fotos_categoria_check
  check (categoria is null or categoria in ('paisaje', 'ruta', 'moto', 'gente', 'comida', 'alojamiento', 'pueblos', 'otro'));

-- Lugar detectado a partir del GPS de la foto (null = falta detectar, '' = sin resultado)
alter table public.fotos add column if not exists lugar text;
alter table public.fotos add column if not exists provincia text;
alter table public.fotos add column if not exists pais text;
create index if not exists fotos_lugar_idx on public.fotos (lugar);
