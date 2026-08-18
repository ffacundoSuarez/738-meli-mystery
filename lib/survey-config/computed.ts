import { AnswerValue } from '../types';
import { toUsd } from './fx';

// ============================================================
// Helpers de campos calculados (se usan como `computed` en preguntas).
// Cada helper devuelve una función (answers) => AnswerValue que el motor
// (applyComputedAnswers) evalúa y mergea en answers antes de persistir.
// ============================================================

/** IDs de monto de precio → id de moneda asociada (para preview / avisos). */
export const PRICE_AMOUNT_MONEDA: Record<string, string> = {
  'q12-precio': 'q12-1-moneda',
  'q19-precio-envio': 'q19-1-moneda-envio',
  'q19a-precio-impuestos': 'q19a-1-moneda-impuestos',
  'q46c-precio-final': 'q46c-1-moneda',
};

/** A11.B se expresa en moneda local del país (CLP/COP), no en A11.1. */
const A11B_AMOUNT_ID = 'q12b-precio-a11b';

/**
 * Código de moneda (1=CLP, 2=COP, 3=USD) para preview / avisos de un monto.
 * A11.B usa el país; el resto usa la pregunta de moneda asociada.
 */
export function monedaCodeForAmount(
  amountId: string,
  answers: Record<string, AnswerValue>
): string | undefined {
  if (amountId === A11B_AMOUNT_ID) {
    const pais = answers['f1-pais'];
    return pais === '1' || pais === '2' ? pais : undefined;
  }
  const monedaId = PRICE_AMOUNT_MONEDA[amountId];
  const code = monedaId ? answers[monedaId] : undefined;
  return typeof code === 'string' && code !== '' ? code : undefined;
}

/** Montos donde un valor bajo en CLP/COP suele indicar error de separador de miles. */
export const PRICE_LOW_AMOUNT_WARN_IDS = new Set([
  'q12-precio',
  'q12b-precio-a11b',
  'q46c-precio-final',
]);

const LOW_LOCAL_AMOUNT_THRESHOLD = 1000;

/**
 * Parsea montos con separadores de miles/decimales (CL/CO o estilo US).
 * Heurística: 3 dígitos tras el último separador → miles; 1–2 → decimal.
 */
export function parseAmount(raw: AnswerValue | undefined): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;

  let s = String(raw).trim();
  if (!s) return null;

  // Quitar símbolos de moneda y espacios (incl. NBSP)
  s = s.replace(/[$€£]|USD|CLP|COP|pesos?/gi, '').replace(/\s/g, '');
  if (!s) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  const lastSep = Math.max(lastDot, lastComma);

  // Miles con un solo separador + exactamente 3 dígitos: 87.000 / 87,000
  // (antes de Number(), porque Number("87.000") === 87)
  if (lastSep > 0) {
    const after = s.slice(lastSep + 1);
    const before = s.slice(0, lastSep);
    if (
      /^\d{3}$/.test(after) &&
      !before.includes('.') &&
      !before.includes(',') &&
      /^\d+$/.test(before)
    ) {
      const n = Number(before + after);
      return Number.isFinite(n) ? n : null;
    }
  }

  // Solo dígitos o decimal simple con punto (sin coma)
  if (/^\d+(\.\d{1,2})?$/.test(s) && !s.includes(',')) {
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  if (lastSep === -1) {
    // Solo dígitos (ya cubierto) o basura
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  const after = s.slice(lastSep + 1);
  const before = s.slice(0, lastSep);
  const sep = s[lastSep];

  // Varios grupos de miles: 1.234.567 o 1,234,567
  if (
    (sep === '.' && /^\d{1,3}(\.\d{3})+$/.test(s)) ||
    (sep === ',' && /^\d{1,3}(,\d{3})+$/.test(s))
  ) {
    const n = Number(s.replace(/[.,]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  // Decimal: 87,50 o 87.5 (1–2 dígitos tras el separador)
  if (/^\d{1,2}$/.test(after)) {
    const intPart = before.replace(/[.,]/g, '');
    const n = Number(`${intPart}.${after}`);
    return Number.isFinite(n) ? n : null;
  }

  // 1.234,56 (CL/CO) o 1,234.56 (US)
  if (lastDot > lastComma && lastComma >= 0) {
    // US: coma miles, punto decimal
    const n = Number(s.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  if (lastComma > lastDot && lastDot >= 0) {
    // CL/CO: punto miles, coma decimal
    const n = Number(s.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Etiqueta corta de moneda para el preview. */
export function monedaLabel(monedaCode: string | undefined): string {
  switch (monedaCode) {
    case '1':
      return 'CLP';
    case '2':
      return 'COP';
    case '3':
      return 'USD';
    default:
      return '';
  }
}

/**
 * Preview de conversión para UI: monto interpretado + USD.
 * Null si falta monto o moneda.
 */
export function amountUsdPreview(
  amountRaw: AnswerValue | undefined,
  monedaCode: AnswerValue | undefined
): { amount: number; usd: number; moneda: string } | null {
  const amount = parseAmount(amountRaw);
  if (amount === null) return null;
  if (typeof monedaCode !== 'string' || monedaCode === '') return null;
  const usd = toUsd(amount, monedaCode);
  if (usd === null) return null;
  return { amount, usd, moneda: monedaLabel(monedaCode) };
}

/**
 * True si el monto en CLP/COP parece demasiado bajo (posible error de miles).
 * No aplica a envío/impuestos (0 es válido) ni a USD.
 */
export function isImplausiblyLowLocalAmount(
  amountId: string,
  amountRaw: AnswerValue | undefined,
  monedaCode: AnswerValue | undefined
): boolean {
  if (!PRICE_LOW_AMOUNT_WARN_IDS.has(amountId)) return false;
  if (monedaCode !== '1' && monedaCode !== '2') return false;
  const amount = parseAmount(amountRaw);
  if (amount === null) return false;
  // 0 puede ser edge case; avisar solo si hay un valor positivo pero muy bajo
  return amount > 0 && amount < LOW_LOCAL_AMOUNT_THRESHOLD;
}

/**
 * Precio en dólares a partir de un monto y una moneda.
 * @param amountId id de la pregunta con el monto (número).
 * @param monedaId id de la pregunta con el código de moneda (1/2/3).
 * @returns string con 2 decimales, o '' si falta el dato o la moneda es inválida.
 */
export function usdFrom(amountId: string, monedaId: string) {
  return (answers: Record<string, AnswerValue>): AnswerValue => {
    const amount = parseAmount(answers[amountId]);
    if (amount === null) return '';
    const moneda = answers[monedaId];
    if (typeof moneda !== 'string' || moneda === '') return '';
    const usd = toUsd(amount, moneda);
    if (usd === null) return '';
    return usd.toFixed(2);
  };
}

const PRODUCT_USD = 'q12a-precio-usd';
const PRODUCT_A11B = 'q12b-precio-a11b';
const PRODUCT_MONEDA = 'q12-1-moneda';
const SHIPPING_USD = 'q19-2-precio-envio-usd';
const TAX_USD = 'q19b-impuestos-usd';
const TOTAL_USD = 'q46c-2-precio-usd';

/**
 * USD del producto para F13.3: si A11.1 es dólares y hay A11.B (moneda local),
 * A11.B reemplaza a A11. `0` cuenta como respondida.
 */
export function productUsdForTotals(
  answers: Record<string, AnswerValue>
): number | null {
  if (answers[PRODUCT_MONEDA] === '3') {
    const a11b = parseAmount(answers[PRODUCT_A11B]);
    if (a11b !== null) {
      const localCode = monedaCodeForAmount(PRODUCT_A11B, answers);
      if (localCode) {
        const usd = toUsd(a11b, localCode);
        if (usd !== null) return usd;
      }
    }
  }
  return parseAmount(answers[PRODUCT_USD]);
}

/**
 * Compara (A11.2 o A11B) + A20.2 + A21.2 vs F13.2 en USD.
 * Tolerancia: max($1, 2% del total F13.2).
 */
export function totalsMatch(
  answers: Record<string, AnswerValue>
): boolean | null {
  const product = productUsdForTotals(answers);
  const shipping = parseAmount(answers[SHIPPING_USD]);
  const tax = parseAmount(answers[TAX_USD]);
  const total = parseAmount(answers[TOTAL_USD]);
  if (
    product === null ||
    shipping === null ||
    tax === null ||
    total === null
  ) {
    return null;
  }
  const sum = product + shipping + tax;
  const tolerance = Math.max(1, Math.abs(total) * 0.02);
  return Math.abs(sum - total) <= tolerance;
}

/**
 * Campo computado F13.3: VERDADERO / FALSO si cierran los totales en USD.
 * Vacío si faltan datos.
 */
export function totalsMatchLabel() {
  return (answers: Record<string, AnswerValue>): AnswerValue => {
    const match = totalsMatch(answers);
    if (match === null) return '';
    return match ? 'VERDADERO' : 'FALSO';
  };
}

/** Fecha (date o datetime) → Date en UTC a medianoche; null si es inválida. */
function parseDate(raw: AnswerValue | undefined): Date | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  // date → YYYY-MM-DD; datetime → YYYY-MM-DDTHH:MM → se toma solo el día
  const day = raw.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Cantidad de días naturales (calendario) entre dos fechas.
 * @param fromDateId id de la pregunta con la fecha inicial.
 * @param toDateId id de la pregunta con la fecha final.
 * @returns string con el entero de días, o '' si falta alguna fecha.
 */
export function naturalDaysBetween(fromDateId: string, toDateId: string) {
  return (answers: Record<string, AnswerValue>): AnswerValue => {
    const from = parseDate(answers[fromDateId]);
    const to = parseDate(answers[toDateId]);
    if (from === null || to === null) return '';
    const days = Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
    return String(days);
  };
}
