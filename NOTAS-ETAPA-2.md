# Etapa 2 — Carga del cuestionario real (728 Mercado Envíos)

> Documento de traspaso. La Etapa 1 (infra + esquema `meli_` + branding) está
> terminada y verificada. Esto describe qué falta y con qué reglas hacerlo.

---

## Estado al momento del traspaso

### Hecho y verificado

- Proyecto Next.js 16 corriendo, `npm run build` y `npx tsc --noEmit` limpios.
- Esquema `meli_` aplicado en Supabase. **Comparte proyecto con `mystery-shopper-prosegur`**
  (197 postulantes en producción) — por eso todo lleva prefijo `meli_`.
- Las 14 RPC pasaron un smoke test del ciclo completo: crear → responder → enviar a
  revisión → rechazar con corrección → reenviar → aprobar → borrar.
- Prosegur verificado intacto después de correr el SQL.
- Passcode actual: `operaciones123` (en `app_config.meli_passcode_hash` y en
  `INTERNAL_PASSCODE` de `.env.local`). **Conviene cambiarlo**: es el mismo de Prosegur
  y es lo único que protege los datos de ambos proyectos.
- **Paso 0 hecho:** extracción fiel del `.docx` (ver abajo).

### Lo que hay cargado hoy es un PLACEHOLDER

`lib/survey-config/constants.ts`, `parte-1.ts`, `parte-2.ts`, `parte-3.ts` tienen un
cuestionario inventado de 7 países para probar el flujo. **Se reemplaza entero.**

---

## Paso 0 — Extracción fiel (ya hecho, reproducible)

```bash
node scripts/extraer-fiel.mjs "incoming/728 - Mystery Mercado Envios - Cuestionario.docx" incoming/fiel.txt
node scripts/compactar.mjs incoming/fiel.txt incoming/compacto.txt
```

- `incoming/fiel.txt` — un párrafo por línea + marcadores `<<TABLA>>/<<FILA>>/<<CELDA>>`.
  Es la **fuente de verdad** para el verificador de fidelidad.
- `incoming/compacto.txt` (695 líneas) — una fila de tabla por línea, celdas separadas
  por ` ⟨|⟩ `. Es la vista cómoda para transcribir. El texto de cada celda es exacto.

Ambos están gitignoreados (`incoming/`), se regeneran con los comandos de arriba.

Los scripts anotan el resaltado del Word como `«hl=...»`:
`lightGray` = variable auxiliar · `cyan` = pregunta nueva · `green` = requiere evidencia ·
`yellow` = énfasis (no es categoría). Y los comentarios como `«com=N»`.

---

## LA REGLA: fidelidad textual

**Los enunciados y las opciones se transcriben literal del `.docx`.** Sin reescribir,
sin mejorar redacción, sin corregir estilo, sin normalizar mayúsculas ni acentos.

Es mystery shopping: el wording condiciona la respuesta, y MEGA ya validó ese texto con
MELI. Cualquier retoque rompe la comparabilidad con olas anteriores y con la base.

| Caso | Qué se hace |
|---|---|
| Erratas, mayúsculas, acentos, tildes inconsistentes | Literal, sin tocar |
| Comillas curvas `“ ”` / rectas `"` / pares desparejos (`"Nunca llegó”`) | Literal, sin unificar |
| Códigos de opción `97` Otro, `98` No especifica, `99` No sabe/N/A | Exactos, no se renumeran |
| `**` de markdown pegado en Word | Ya se quita en la extracción |
| Espacios no-quebrables `U+00A0` | Ya se normalizan en la extracción |

Si algo parece un error de contenido: **no se corrige**, se anota en la lista para MELI.

### Lo que NO va al texto visible (son metadatos del documento)

- `RU` / `RM` / `RA` / `NUMERICA` / `URL` / `TEXTO` → `Question.type`
- Líneas `PROGRAMADOR: ...` → `showIf` / `computed`
- `[CHILE]` / `[COLOMBIA]` → `showIf` por opción
- `DD/MM/AAAA` / `HH:MM` → `type: 'date'` / `'time'`
- Notas y aclaraciones → van a `hint`, **no** fusionadas al enunciado

### Lo que SÍ se mantiene

El número de pregunta visible dentro del texto: `24.1.`, `55a.`, `38.Q1.22.a.`

---

## Convención de IDs (decidida con el cliente)

Los códigos del documento son inconsistentes (`24.1.Q4.22`, `31Q3.1`, `38.Q1.22.b`) y
los puntos complican las consultas sobre el `jsonb`. Se normalizan, preservando el
original:

```ts
{
  id: 'q24-1-rangos-horario',      // clave en answers (jsonb)
  codigoOriginal: '24.1.Q4.22',    // para cruzar con el Excel de MEGA
  text: '24.1.Q4.22 ¿Cuantos rangos de horario te ofrecieron?',  // LITERAL
  type: 'single',
}
```

Requiere sumar `codigoOriginal?: string` a `Question` en `lib/types.ts`, y que
`lib/export.ts` lo emita como encabezado de columna cuando exista.

---

## Qué es el estudio

Benchmarking de competencia para Mercado Envíos. El shopper **compra de verdad** en un
marketplace competidor (Falabella, Amazon, AliExpress, Temu) y evalúa toda la
experiencia logística hasta la entrega física del paquete.

- **Solo Chile y Colombia.** Amazon aplica **únicamente a Colombia** (en la tabla de
  Chile esa celda está vacía).
- Ciudades (orden según pregunta `10`, que difiere del de la tabla de variables
  auxiliares — usar el de la pregunta): Chile = Santiago / Antofagasta / Concepción.
  Colombia = Bogotá / Medellín / Cali.
- **Es longitudinal**: se compra, pasan días, llega el paquete.

Volumen: ~95 preguntas · 34 variables auxiliares · 13 puntos de evidencia ·
21 instrucciones `PROGRAMADOR:` · 38 comentarios abiertos de MEGA a MELI.

---

## División en partes (decidida)

**3 partes, por momento del proceso.** Mantiene `parte-1/2/3`, así que
`meli_reviewable_sections()` **no cambia** y el SQL ya aplicado sigue sirviendo.

| Parte | Contenido |
|---|---|
| `parte-1` | Datos de la compra (01–10) + `SELECCIÓN / COMPRA DE PRODUCTO` (11–19b) + `PROMESAS DE ENTREGA` (24–26f) |
| `parte-2` | `NOTIFICACIONES` (27–31Q4, 54) + `CONTACTOS` (55.1–55g) |
| `parte-3` | `ENTREGA` (33–46c.2) |

---

## Trabajo pendiente

### 1. Extender el motor — `lib/types.ts`, `lib/survey-logic.ts`  ← EMPEZAR ACÁ

Tres huecos reales. El resto del cuestionario entra con lo que ya existe.

**a) Condiciones numéricas por rango.** `ConditionOperator` hoy es
`'eq' | 'neq' | 'in' | 'notIn'` (todo comparación de strings). Sumar
`'gte' | 'lte' | 'gt' | 'lt'` y manejarlos en `evaluateClause` parseando ambos lados
como número; si no parsean, la condición es falsa (no lanzar).

Lo necesitan los tres saltos que cuelgan de `55a` (escala 0–10):
```
55a.1  PROGRAMADOR: HACER SI 55a es 0 a 6
55a.2  PROGRAMADOR: HACER SI 55a es 7 a 8
55a.3  PROGRAMADOR: HACER SI 55a es 9 a 10
```

**b) Piping de texto.** `55a.1/2/3` dicen `¿... calificaste de ese modo a
[INSERTAR MARCA] ...?`. Hace falta una función `interpolate(text, answers)` que
reemplace el marcador por la etiqueta de la respuesta de `8. Competidor`. Aplicarla
donde hoy se llama `pick()` para el enunciado. Reutilizar `getAnswerLabel` de
`lib/format.ts`.

**c) Variables calculadas.** No existe nada parecido en el motor. Sumar
`computed?: (answers) => AnswerValue` a `Question`, evaluarlas en `SurveyForm` antes de
persistir y mergear el resultado en `answers`, para que viaje al `jsonb` y esté
disponible en exports y dashboard sin recalcular.

### 2. Catálogos — `lib/survey-config/constants.ts`

Reescribir completo: ciudades, competidores (Amazon solo COL), las 19 categorías,
monedas, transportadoras nacionales e internacionales, medios de notificación. Todo
con `showIf: pais(...)` por opción, y todo literal.

> **Ojo:** `8. Competidor`, `15. Logística` (Player/Seller) y `16. Inventario` (1P/3P)
> **no traen códigos numéricos en el documento** — las celdas de código están vacías.
> Hay que asignar valores internos estables (slugs) y anotarlo para MELI.

### 3. Transcribir las ~95 preguntas — `parte-1.ts` / `parte-2.ts` / `parte-3.ts`

13 puntos piden evidencia inline (`15c`, `18n`, `18a`, `24.5`, `31a`, `33a`, `41`,
`41a`, `42`, `46a`, `54.1`, `55b`, `55g`). El motor ya soporta `type: 'evidence'` como
pregunta suelta — no hace falta que viva solo en un módulo al final como en Prosegur.

### 4. Calculadas y tipo de cambio — `computed.ts`, `fx.ts`

Con fórmula conocida:
- **USD**: `12a`, `19.2`, `19b`, `46c.2` — monto × cotización según moneda y país
- **Días naturales**: `25c`, `26e`, `26f`, desviación de fecha de entrega

Sin criterio definido por MELI → declarar con `TODO`, no inventar:
- Totales por sección (`ENTREGA Total`, `CONTACTOS Total`, `Total`) — dice "porcentaje"
  y nada más
- `Tipo de entrega` (On time / Early)
- `OK / NOT OK`

Tipo de cambio: **constante en el código**, en `lib/survey-config/fx.ts`, con las
cotizaciones CLP→USD y COP→USD y **la fecha a la que corresponden anotada**. Un solo
lugar para tocar. (Limitación asumida por el cliente: cambiar cotización = deploy, y
no queda registro de cuál se usó en cada caso.)

### 5. Verificador de fidelidad textual — **no saltear**

Script que recorre `surveySections`, toma cada `text`, `hint` y `label` de opción, y
verifica que aparezca literal en `incoming/fiel.txt`. Reporta cualquier cadena que no
matchee. Es la única forma de garantizar que no se coló una reescritura entre ~95
preguntas y varios cientos de opciones.

También debe chequear que ningún `text` contenga ` ⟨|⟩ `, `PROGRAMADOR`, marcadores de
tipo sueltos (`RU`/`RA`/`RM`/`NUMERICA`) ni `U+00A0`.

### 6. Panel y SQL

- Ampliar `meli_admin_create_postulante` con `p_ola`.
- Reponer códigos por país: `meli_country_suffix` con `1=CHI`, `2=COL` (con solo dos
  países vuelve a tener sentido; se descartó en la Etapa 1 cuando eran 7).
- **Actualizar la allowlist de `meli_summary_answers()`** con los IDs reales de
  screening. ⚠️ Si no coincide, **todos los gráficos del dashboard salen vacíos sin
  lanzar ningún error** — parece "todavía no hay datos".
- Reescribir `lib/survey-snapshot.ts` contra esos IDs.
- Ejes útiles de los gráficos acá: país, competidor, categoría, `Tipo de entrega`
  (hoy cruzan país×categoría×canal×marca, que es de Prosegur).

### 7. Lista de pendientes para MELI

Consolidar los 38 comentarios del `.docx` más lo que aparezca al transcribir.

---

## Variables auxiliares — 8 de 13 ya son preguntas

El bloque de "VARIABLES AUXILIARES" del encabezado es en buena parte el **diccionario
de datos del archivo de salida**, no trabajo extra:

| Variable auxiliar | Pregunta del cuerpo |
|---|---|
| Ciudad | `10. Ciudad de entrega` |
| Categoría | `11. Categoría del Producto` |
| Competidor | `8. Competidor` |
| Logística | `15. ¿Cuál es el tipo de logística?` |
| Inventario | `16. ¿Tipo de inventario?` |
| Item | `03. Producto (Ítem) Evaluado` |
| Fecha inicio | `01. Fecha de compra` |
| Hora inicio | `02. Hora de compra` |

Las 5 restantes:
- `País` → precargado por Ops en `f1-pais` y además visible como primera pregunta.
  **Ya funciona así, no tocar.**
- `Ola` → la setea Ops al crear el caso (el shopper no la conoce).
- `ID de Encuesta` → ya existe: es la columna `code`.
- `Tiempo fuera`, `Contacto`, `Compra` → pasan a ser preguntas del cuestionario.

---

## Bloqueantes conocidos (para llevarle a MELI)

De los comentarios de MEGA en el `.docx`:

- Fórmula de los totales por sección y del `Total` general
- Criterio de `Tipo de entrega` (On time / Early) y de `OK / NOT OK`
- Qué contienen `Item`, `Origen del ítem`, `Tiempo fuera`, `Contacto` (vienen vacías
  en la base y sin definición)
- **Transportadoras internacionales de Chile: la tabla está vacía en el documento**
- Si se mantiene la lógica de `31Q3.1` (las variables no están en la base)
- Si `P70`–`P72` (etiqueta chica, corredor, gaiola, LM Hub) entran — el propio
  comentario de MEGA dice que parecen del cuestionario de Brasil. **Por ahora fuera.**
- Si `55e1 → Otros` se pregunta a todos o solo a quienes eligieron "Otros"
- Competidor / Logística / Inventario sin códigos numéricos en el documento
- El `**.**` y las comillas desparejas (se normalizó lo invisible, se avisa igual)

---

## Verificación final

1. `npm run build` y `npx tsc --noEmit` limpios.
2. Verificador de fidelidad textual sin hallazgos.
3. `codigoOriginal` únicos; códigos `97`/`98`/`99` donde el documento los pone.
4. `evaluateClause` con `gte/lte` en los tramos de `55a` (0, 6, 7, 8, 9, 10) y con
   valores no numéricos.
5. En el navegador: crear un caso, recorrer las 3 partes, verificando la escala 0–10 de
   `55a` (dibuja **0..10**, no 1..11 — el bug de `scaleMin || 1` ya se corrigió en
   `components/survey/QuestionInput.tsx`), los tres saltos que dependen de ella, el
   piping de `[INSERTAR MARCA]`, y que las opciones de Chile no aparezcan en un caso de
   Colombia.
6. Que las derivadas de USD y días naturales queden persistidas en `answers` y salgan
   en el export de Excel.

---

## Trampas de este repo

- **Base Supabase compartida con Prosegur en producción.** Todo objeto global lleva
  prefijo `meli_`: tablas, funciones, secuencias, el bucket (`evidencia-meli`) y —fácil
  de olvidar— **los nombres de policy sobre `storage.objects`**, que son únicos por
  tabla. `public.app_config` es compartida: solo `create table if not exists` +
  `insert ... on conflict do nothing`, nunca `alter` ni `delete`.
- **`meli_summary_answers()` rompe en silencio.** Ver punto 6 arriba.
- **`npm run lint` da 7 errores heredados** en componentes copiados de Prosegur
  (`SurveyForm`, `ResponseDetails`, páginas del dashboard). No rompen el build; vienen
  de que npm resolvió `eslint-config-next` 16.2.12 en vez de 16.2.9 y reglas nuevas de
  react-hooks los promovieron de warning a error. No son regresiones nuevas.
- El `supabase/schema.sql` **de Prosegur** está desactualizado (le faltan columnas y 6
  RPCs). No usarlo como referencia. El de Meli
  (`supabase/migrations/0001_meli_schema.sql`) sí está completo y consolidado.
