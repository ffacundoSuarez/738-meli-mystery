# Mystery Shopper Mercado Libre

Sistema de gestión de encuestas Mystery Shopper para Mercado Libre.
Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn/ui + Supabase.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completar con las credenciales de Supabase
npm run dev
```

## Base de datos

Corré las migraciones en orden en el SQL Editor de Supabase (`0001` … `0005`).

> **Importante:** este proyecto comparte la base Supabase con `mystery-shopper-prosegur`.
> Todos los objetos llevan prefijo `meli_` para no colisionar. El script es puramente
> aditivo: no toca ninguna tabla, función, policy ni bucket de Prosegur.

Antes de correrlo, reemplazá el literal `CAMBIAR_ESTE_PASSCODE` por el passcode real
del panel Ops, y poné **exactamente el mismo valor** en `INTERNAL_PASSCODE` de tu
`.env.local`. Son dos validaciones independientes: `/api/acceso` compara contra la
variable de entorno y te da la cookie, mientras que cada RPC compara contra el hash
bcrypt guardado en `app_config`. Si difieren, el login entra pero todas las consultas
fallan con `Passcode inválido`.

Si ya corriste el script sin editar el placeholder, volver a correrlo **no** arregla
el hash (el insert es `on conflict do nothing`). Cambialo desde el SQL Editor con:

```sql
select public.meli_admin_update_passcode('CAMBIAR_ESTE_PASSCODE', 'tu-passcode-real');
```

### Usuarios cliente (`/resultados`)

La vista de resultados requiere login con email + contraseña (hasta 3 cuentas).
Las credenciales se guardan hasheadas en `app_config.meli_resultados_clients`
(mismo patrón bcrypt que Ops). **No van en variables de entorno.**

1. Corré `supabase/migrations/0005_meli_resultados_auth.sql`.
2. Cargá los usuarios desde el SQL Editor (requiere passcode Ops válido):

```sql
select public.meli_admin_upsert_resultados_client('tu-passcode-ops', 'email@mercadolibre.com', 'password-seguro');
```

Plantilla sin passwords reales: [`supabase/scripts/seed-resultados-clients.example.sql`](supabase/scripts/seed-resultados-clients.example.sql).

Para rotar una contraseña, volvé a llamar `meli_admin_upsert_resultados_client` con el mismo email.

## Arquitectura

- **Shopper:** accede por `access_token` UUID en la URL (`/encuesta/<token>`).
- **Panel Ops:** passcode compartido, hasheado en `app_config.meli_passcode_hash`.
- **Clientes (`/resultados`):** email + contraseña, hashes en `app_config.meli_resultados_clients`.
  Cookie `meli_resultados_auth` + credenciales en `sessionStorage` (como Ops).
  Datos vía RPC `meli_get_public_results_client` con anon key.
  **Ops** con sesión activa (`meli_auth` + passcode en `sessionStorage`) también puede
  entrar a `/resultados` sin cuenta cliente (`meli_get_public_results_ops`).
- **Todo el acceso a datos pasa por RPCs `security definer`** con prefijo `meli_`.
  La tabla `meli_responses` tiene RLS habilitado sin policies: no se puede consultar
  directo con la anon key.
- **Las respuestas viven en un único `jsonb`** (`answers`), indexado por ID de pregunta.
  El estado del proceso vive en `stages` (una entrada por parte revisable).

### Validación Vision de evidencias (opcional)

El BFF `POST /api/evidencia/validar` llama al Express en Lightsail
(`POST /meli/validate-evidence`). Variables en Vercel / `.env.local`:

| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (shopper, Ops y clientes `/resultados`) |
| `INTERNAL_PASSCODE` | Passcode Ops para `/api/acceso` |
| `LIGHTSAIL_EVIDENCE_URL` | Base URL del servicio (ej. `http://x.x.x.x:3000`) |
| `MELI_SERVICE_KEY` | Secret compartido (mismo valor en Lightsail) |

En Lightsail (`.env` del server): `MELI_SERVICE_KEY`, opcional `MELI_VISION_MODEL`
(default `gpt-4o`). Requiere `OPENAI_API_KEY` (ya existente).

Si faltan las variables, el upload sigue funcionando (fail-soft → `doubt`).

## Estructura

| Ruta | Qué es |
|---|---|
| `app/encuesta/[id]` | Cuestionario del shopper (entrada por token) |
| `app/acceso` | Login del panel Ops |
| `app/dashboard` | Panel interno: métricas, postulantes, revisión, estadísticas |
| `app/resultados/acceso` | Login clientes Mercado Libre |
| `app/resultados` | Resultados aprobados (requiere sesión cliente) |
| `lib/survey-config/` | Definición del cuestionario (secciones, módulos, preguntas) |
| `lib/survey-logic.ts` | Motor de visibilidad condicional, descalificación y progreso |
| `lib/data.ts` | Capa de acceso a datos (wrappers de los RPCs) |
| `supabase/migrations/` | Esquema SQL |

## Puntos acoplados entre el SQL y el cuestionario

Si cambia la estructura del cuestionario, hay **dos** funciones SQL que hay que
actualizar a la par (están marcadas con comentarios en el propio `.sql`):

1. `meli_reviewable_sections()` — debe coincidir con `REVIEWABLE_SECTIONS` de
   `lib/survey-config.ts`.
2. `meli_summary_answers()` — allowlist de claves de screening que alimenta todos
   los gráficos del dashboard. Si no coincide con los IDs reales de las preguntas,
   **los gráficos salen vacíos sin lanzar ningún error**.
