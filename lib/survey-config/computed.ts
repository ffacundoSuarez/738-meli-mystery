import { AnswerValue } from '../types';
import { toUsd } from './fx';

// ============================================================
// Helpers de campos calculados (se usan como `computed` en preguntas).
// Cada helper devuelve una función (answers) => AnswerValue que el motor
// (applyComputedAnswers) evalúa y mergea en answers antes de persistir.
// ============================================================

/** Parsea un valor de answers como número; vacío/no numérico → null. */
function parseAmount(raw: AnswerValue | undefined): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) ? n : null;
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
