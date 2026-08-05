# Pendientes y bloqueantes para MELI — Etapa 2 (cuestionario 03.08 A–F)

Consolidado tras portar el Word `728 - Mystery Mercado Envios - Cuestionario 03.08.docx`
(base 31.07 + ajustes de hints A12/A13 y tilde en B05).

## Cambios 03.08 ya aplicados en código

- Hint A12: se suma el párrafo de Amazon (“Enviado por”) que antes estaba en A13
- Hint A13: texto nuevo sobre 3P / Falabella (se quitó la línea huérfana no presente en Word)
- B05 opción 3: `especifico` → `específico`

## Cambios 31.07 ya aplicados en código (se mantienen)

- Renumeración A–F en `codigoOriginal` + textos literales
- **D00** nueva (gate de ajuste de fecha); D01/D01.1 solo si D00 = Sí
  (Word decía `HACER SOLO SI D01 = 1` — typo interpretado como D00)
- D03.1.1 / D03.2.1 / D03.3.1 visibles con el tramo de D03 (no solo si Otros)
- **Desviación de la fecha** eliminada (no figura desde 31.07)
- Categorías A10: códigos 1–11 + 97 Otros
- B02.1 numérico; F09.1/F09.2 texto libre; F12 comprobante fiscal
- Mensaje de finalización al enviar parte-3

## Desviaciones intencionales de fidelidad literal

| Caso | Qué hicimos |
|---|---|
| Monedas `(SOLO CHI)` / `(SOLO COL)` / `(TODOS)` | Recortados del label visible; el `showIf` por país ya filtra |
| A16 antes de A13 en el formulario | Para que el filtro 1P de A13 funcione |
| E03 “y el reembolso se acredita” | Soft: se muestra si E02 = Sí |
| F12.1/F12.2 sin PROGRAMADOR en Word | Mantienen `showIf F12=1` |

## Bloqueantes (sin criterio → no inventar en código)

| Tema | Estado en código |
|---|---|
| Fórmula de totales por sección y `Total` general | Fuera del 03.08 |
| Criterio de `Tipo de entrega` (On time / Early) | Fuera del 03.08 |
| Criterio de `OK / NOT OK` | Fuera del 03.08 |
| Cotización FX real y fecha de referencia | Placeholder en `lib/survey-config/fx.ts` |
| Visibilidad / skip del bloque cancelaciones según F03 | Hoy se muestra siempre; confirmar flujo |

## Decisiones ya tomadas (no reabrir)

- Solo Chile (`1`) y Colombia (`2`)
- 3 partes por momento del proceso (`parte-1/2/3`)
- IDs internos estables + `codigoOriginal` A–F
- Fidelidad textual literal salvo las desviaciones de la tabla de arriba
- FX como constante en código (cambiar = deploy)

## Acción pedida a MELI / Ops

1. Confirmar cotizaciones FX y fecha `FX_AS_OF`.
2. Confirmar flujo del bloque cancelaciones (¿solo si F03 = Nunca llegó / No se entregó?).
3. Confirmar si E03 debe pedirse solo cuando hubo reembolso efectivo (hoy: si E02 = Sí).
