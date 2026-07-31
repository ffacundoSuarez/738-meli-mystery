# Pendientes y bloqueantes para MELI — Etapa 2 (cuestionario v2)

Consolidado a partir de los comentarios del `.docx` v2 (`«com=N»`) y
hallazgos al cargar / corregir el cuestionario 728 Mercado Envíos.

## Cambios relevantes v1 → v2 (ya aplicados en código)

- Ali Express fuera; Amazon disponible en CHI y COL
- Nueva pregunta `06. Código de la compra`
- `18a` número + `18b` foto (antes 18n con hint SUMAR FOTO)
- Renumeración de promesas (`24.a`…`24.e`), `25c`→`25b`, entrega (`32`–`36c`)
- Fotos de medio de notificación: `27b` / `28b` / `29b` / `30c`
- Bloque nuevo **COMPRAS NO ENTREGADAS O CANCELADAS**
- Transportadoras int. Chile: DHL + Pasarex (+ 97/98/99)
- Columna Si/No en categorías auxiliares: metadato MEGA, no se muestra al shopper

## Desviaciones intencionales de fidelidad literal

| Caso | Qué hicimos |
|---|---|
| Monedas `(SOLO CHI)` / `(SOLO COL)` / `(TODOS)` | Recortados del label visible; el `showIf` por país ya filtra |
| Numeración duplicada `35` / `36` en el v2 | IDs internos únicos (`35-dias`, `36-anuncio`) para no chocar en export |
| Bloque cancelaciones mal parseado en Word (celdas pegadas) | Enunciados separados con el texto literal recuperable del fiel |

## Bloqueantes (sin criterio → no inventar en código)

| Tema | Estado en código |
|---|---|
| Fórmula de totales por sección y `Total` general | TODO — no implementado |
| Criterio de `Tipo de entrega` (On time / Early) | TODO — no implementado |
| Criterio de `OK / NOT OK` | TODO — no implementado |
| Qué contienen `Item`, `Tiempo fuera`, `Contacto`, `Compra` | No cargados como pregunta automática |
| Columna Si/No de categorías (¿filtra compras permitidas?) | No implementado — confirmar con MELI |
| Lógica de `31Q3.1` | No implementado |
| `P70`–`P72` (parecen de Brasil) | **Fuera** por ahora |
| Cotización FX real y fecha de referencia | Placeholder en `lib/survey-config/fx.ts` |
| Desviación de fecha cuando la promesa fue intervalo | Usa `25a` si hay fecha exacta; intervalo sin criterio |
| Visibilidad / skip del bloque cancelaciones según `34` | Hoy se muestra siempre; confirmar flujo |

## Decisiones ya tomadas (no reabrir)

- Solo Chile (`1`) y Colombia (`2`)
- 3 partes por momento del proceso (`parte-1/2/3`)
- IDs normalizados + `codigoOriginal`
- Fidelidad textual literal salvo las desviaciones de la tabla de arriba
- P70–P72 fuera
- FX como constante en código (cambiar = deploy)

## Acción pedida a MELI / Ops

1. Confirmar cotizaciones FX y fecha `FX_AS_OF`.
2. Definir fórmulas de totales, Tipo de entrega y OK/NOT OK.
3. Confirmar si la columna Si/No de categorías debe filtrar el trabajo de campo.
4. Confirmar códigos internos de Competidor / Logística / Inventario.
5. Confirmar flujo del bloque cancelaciones (¿solo si `34` = Nunca llegó / No se entregó?).
6. Confirmar si P70–P72 quedan definitivamente fuera.
7. Aplicar en Supabase la migración `0003_meli_summary_answers_v2.sql` (allowlist `q34-entrega-tiempo`).
