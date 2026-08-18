# Mystery Shopper Mercado Libre

Sistema de gestión de encuestas Mystery Shopper para **Mercado Envíos** (estudio 728).
El shopper compra de verdad en Falabella, Amazon o Temu (Chile / Colombia) y evalúa
la logística hasta la entrega. Cuestionario **03.08 A–F** ya cargado en código.

Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn/ui + Supabase.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completar con las credenciales de Supabase
npm run dev
```

Scripts útiles: `npm run smoke:logic` · `npm run verify:fidelity` (necesita `incoming/fiel.txt`).

## Base de datos

Correr **en orden** en el SQL Editor de Supabase:

1. `supabase/migrations/0001_meli_schema.sql` — esquema, RPCs, bucket `evidencia-meli`
2. `supabase/migrations/0002_meli_etapa2_panel.sql` — códigos `ML-CHI-001` / `ML-COL-002`, `ola`, allowlist de screening
3. `supabase/migrations/0003_meli_summary_answers_v2.sql` — fix de la clave `q34-entrega-tiempo`

`0004_meli_fix_usd_amounts.sql` es un backfill puntual de montos USD, no forma parte del setup inicial.

> **Importante:** este proyecto comparte la base Supabase con `mystery-shopper-prosegur`
> (y convive con Mystery Candidate). Todos los objetos llevan prefijo `meli_` para no
> colisionar. Los scripts son aditivos: no tocan tablas, funciones, policies ni buckets
> de los otros estudios.

Antes de correr `0001`, reemplazá el literal `CAMBIAR_ESTE_PASSCODE` por el passcode real
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

## Arquitectura

- **Sin auth de usuarios.** El shopper accede por un `access_token` UUID en la URL
  (`/encuesta/<token>`). El panel Ops usa un passcode compartido, hasheado con bcrypt
  en `app_config.meli_passcode_hash` y validado dentro de Postgres. El guard de rutas
  del dashboard es `proxy.ts`.
- **Todo el acceso a datos pasa por RPCs `security definer`** con prefijo `meli_`.
  La tabla `meli_responses` tiene RLS habilitado sin policies: no se puede consultar
  directo con la anon key.
- **Las respuestas viven en un único `jsonb`** (`answers`), indexado por ID de pregunta.
  El estado del proceso vive en `stages` (una entrada por `parte-1` / `parte-2` / `parte-3`).
- Flujo longitudinal: compra → revisión → notificaciones/contactos → revisión → entrega.

### Validación Vision de evidencias (opcional)

El BFF `POST /api/evidencia/validar` llama al Express en Lightsail
(`POST /meli/validate-evidence`). Variables en Vercel / `.env.local`:

| Variable | Descripción |
|---|---|
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
| `app/resultados` | Vista pública de resultados aprobados (sin login) |
| `lib/survey-config/` | Definición del cuestionario 03.08 (`parte-1/2/3`, catálogos, FX) |
| `lib/survey-logic.ts` | Motor de visibilidad, descalificación, computed y progreso |
| `lib/data.ts` | Capa de acceso a datos (wrappers de los RPCs) |
| `supabase/migrations/` | Esquema SQL (fuente de verdad; correr 0001–0003) |

## Puntos acoplados entre el SQL y el cuestionario

Si cambia la estructura del cuestionario, hay **dos** funciones SQL que hay que
actualizar a la par (están marcadas con comentarios en el propio `.sql`):

1. `meli_reviewable_sections()` — debe coincidir con `REVIEWABLE_SECTIONS` de
   `lib/survey-config.ts`.
2. `meli_summary_answers()` — allowlist de claves de screening que alimenta todos
   los gráficos del dashboard. Si no coincide con los IDs reales de las preguntas,
   **los gráficos salen vacíos sin lanzar ningún error**.

## Documentación de trabajo

- `PENDIENTES-MELI.md` — ítems abiertos de negocio (FX, OK/NOT OK, cancelaciones).
- `NOTAS-ETAPA-2.md` — **histórico**: reglas de fidelidad y traspaso de la carga del Word.
  El cuestionario placeholder ya no está; no usar ese archivo como estado actual.
