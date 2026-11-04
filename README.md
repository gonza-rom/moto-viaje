# Mis viajes en moto

Bitácora privada de viajes: fotos, kilómetros, odómetro, ruta GPX en mapa y estadísticas.

**Stack:** Next.js 15 (App Router, Server Actions) · Tailwind v4 · Cloudinary (fotos, videos + GPX) · Supabase (solo Postgres) · Leaflet

## Setup

1. **Supabase** → proyecto nuevo → SQL Editor → pegar `supabase/schema.sql` → Run.
   Copiá `Project URL` y la `service_role` key (Settings → API).
2. **Cloudinary** → Dashboard → copiá Cloud name, API Key y API Secret.
3. Variables:
   ```bash
   cp .env.example .env.local
   # completar; AUTH_SECRET: openssl rand -hex 32
   ```
4. Correr:
   ```bash
   npm install
   npm run dev
   ```
5. **Deploy en Vercel:** importar el repo y cargar las mismas variables de entorno.

## Cómo funciona

- **Íconos:** lucide-react.
- **Login:** una sola contraseña (`APP_PASSWORD`). Cookie httpOnly firmada con HMAC, 90 días. Si cambiás la contraseña se cierran todas las sesiones.
- **Fotos:** se suben directo del navegador a Cloudinary con firma del servidor (`/api/cloudinary/sign`), sin pasar por Vercel, así no hay límite de tamaño. Se guarda el original y se sirven optimizadas con `f_auto,q_auto` + `srcset`. HEIC del iPhone funciona.
- **Videos:** mismo flujo (firma + subida directa), en `moto-viajes/videos`. Los de más de 20 MB se suben en partes. Se sirven con `f_auto:video,q_auto` y portada automática (`so_auto`). Límite configurable con `NEXT_PUBLIC_CLOUDINARY_MAX_VIDEO_MB` (plan gratuito: 100 MB). Un video puede ser la portada del viaje.
- **Km:** cargás los km a mano, o se calculan del odómetro (llegada − salida) o del GPX (distancia del track).
- **Ruta en el mapa:** en el formulario, "Marcar ruta en el mapa": tocás el mapa (o buscás un lugar por nombre, o usás Desde → Hasta) y la ruta se calcula por calles con OSRM, o en línea recta. Las paradas se arrastran, reordenan y quitan. Se guarda en `viajes.ruta` (jsonb) y autocompleta los km. En el detalle hay un link para abrirla en Google Maps.
- **GPX:** se lee en el navegador, se dibuja en el mapa y se guarda en Cloudinary como `raw`.
- **Mapa general:** el dashboard muestra todos los recorridos juntos (ruta marcada o GPX). Capas: oscuro, satélite y topográfico.
- **Borrar** un viaje, foto o video también lo borra de Cloudinary.
- **Supabase:** RLS activado sin políticas → la anon key no puede acceder. Todo pasa por el servidor con la service role.

## Estructura

```
src/
  middleware.ts                 protege todo salvo /login
  app/
    actions.ts                  server actions (login, CRUD viajes/motos)
    login/page.tsx
    api/cloudinary/sign/route.ts
    (app)/
      layout.tsx                shell con nav
      page.tsx                  dashboard
      viajes/page.tsx           listado por año + búsqueda
      viajes/nuevo/page.tsx
      viajes/[id]/page.tsx      detalle: portada, datos, mapa, galería
      viajes/[id]/editar/page.tsx
      motos/page.tsx
  components/                   ViajeForm, Galeria, MapaRuta, ViajeCard, Shell…
  lib/                          supabase, cloudinary, cld (URLs), gpx, queries, format, auth
supabase/schema.sql
```
