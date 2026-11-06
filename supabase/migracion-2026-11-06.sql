-- Moto Viajes — localidades del recorrido y tanque de la moto (06/11/2026)
-- Se puede correr más de una vez.

-- Localidades por las que pasa el recorrido (sacadas del GPX / ruta): [{ nombre, provincia, pais, km, lat, lng }]
alter table public.viajes add column if not exists lugares jsonb;

-- Capacidad del tanque, para calcular la autonomía en el planificador
alter table public.motos add column if not exists tanque_litros numeric(5,1);
