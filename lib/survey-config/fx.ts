// ============================================================
// Tipos de cambio (FX) — Mercado Envíos
//
// ⚠️ Valores PLACEHOLDER. Ops/MELI debe fijar la cotización real y la fecha
// de referencia antes de salir a campo. Actualizar en un solo lugar (acá).
// ============================================================

/** Cotizaciones — actualizar en un solo lugar. Fecha de referencia anotada. */
export const FX_AS_OF = '2026-07-01'; // placeholder date — Ops debe fijar la fecha real de la cotización

export const FX_CLP_TO_USD = 0.00105; // placeholder — ~950 CLP/USD
export const FX_COP_TO_USD = 0.00025; // placeholder — ~4000 COP/USD

/**
 * Convierte un monto a dólares según el código de moneda.
 * moneda 1=CLP, 2=COP, 3=USD (se devuelve tal cual).
 * Devuelve null si el código no se reconoce.
 */
export function toUsd(amount: number, monedaCode: string): number | null {
  switch (monedaCode) {
    case '1':
      return amount * FX_CLP_TO_USD;
    case '2':
      return amount * FX_COP_TO_USD;
    case '3':
      return amount;
    default:
      return null;
  }
}
