# Pendientes y bloqueantes para MELI — Etapa 2

Consolidado a partir de los 38 comentarios del `.docx` (`«com=N»`) y
hallazgos al transcribir el cuestionario 728 Mercado Envíos.

## Bloqueantes (sin criterio → no inventar en código)

| Tema | Estado en código |
|---|---|
| Fórmula de totales por sección (`ENTREGA Total`, `CONTACTOS Total`) y `Total` general (dice "porcentaje" sin más) | TODO — no implementado |
| Criterio de `Tipo de entrega` (On time / Early) | TODO — no implementado |
| Criterio de `OK / NOT OK` | TODO — no implementado |
| Qué contienen `Item`, `Origen del ítem` (`17b`), `Tiempo fuera`, `Contacto` (vacías / sin definición) | `17b` como texto libre opcional; resto no cargado como pregunta automática |
| Transportadoras internacionales de Chile: tabla vacía en el documento | Solo opciones 97/98/99 |
| Lógica de `31Q3.1` (comentario confuso; variables no están en la base) | No implementado |
| Si `P70`–`P72` (etiqueta chica / gaiola / LM Hub) entran — MEGA dice que parecen de Brasil | **Fuera** por ahora |
| Si `55e1 → Otros` se pregunta a todos o solo a quienes eligieron "Otros" | Hoy: companion solo si eligieron código 4 |
| Competidor / Logística / Inventario sin códigos numéricos en el documento | Slugs internos: `falabella`, `ali-express`, `amazon`, `temu`, `player`/`seller`, `1p`/`3p` |
| Cotización FX real (CLP/COP → USD) y fecha de referencia | Placeholder en `lib/survey-config/fx.ts` (`FX_AS_OF = 2026-07-01`) — Ops debe fijar |
| Desviación de fecha de entrega cuando la promesa fue intervalo (26a/26b) | Usa `25a` si hay fecha exacta; intervalo sin criterio |

## Comentarios del .docx (com=0 … com=38)

Revisar el Word / `incoming/fiel.txt` buscando `«com=N»`. Incluyen, entre otros:

- Categorías / Item / Tiempo fuera / Contacto / Compra (com 0–5)
- Monedas nuevas (12.1, 19.1, 19a.1, 46c.1) (com 6, 10, 11, 33)
- Vendido por "Otro" (com 8)
- Origen del ítem (com 9)
- Rangos de horario "Más ¿Cuántos?" / Especificar (com 12–14)
- Totales Fecha Específica / Intervalo / Seleccionado (com 15, 19)
- Tracking 31Q3.1 (com 20)
- Describa calificación 55a.1/2/3 (com 21–23)
- Otra compensación (com 24)
- Contacto demorado Total (com 25)
- N/A en notificaciones de entrega / delay / compensación (com 26–30)
- Transportadoras nac./int. (com 31–32)
- CONTACTOS Total / Padrao Total / Total / Tipo de entrega / OK·NOT OK (com 34–38)

## Decisiones ya tomadas (no reabrir)

- Solo Chile (`1`) y Colombia (`2`); Amazon solo COL
- 3 partes por momento del proceso (`parte-1/2/3`)
- IDs normalizados + `codigoOriginal` del documento
- Fidelidad textual literal (erratas y comillas desparejas incluidas)
- P70–P72 fuera
- FX como constante en código (cambiar = deploy)

## Acción pedida a MELI / Ops

1. Confirmar cotizaciones FX y fecha `FX_AS_OF`.
2. Definir fórmulas de totales, Tipo de entrega y OK/NOT OK.
3. Completar transportadoras internacionales de Chile o confirmar que solo aplica 97/98/99.
4. Confirmar códigos internos de Competidor / Logística / Inventario (o proveer numéricos).
5. Definir contenido de Item / Origen / Tiempo fuera / Contacto / Compra.
6. Confirmar si P70–P72 quedan definitivamente fuera.
