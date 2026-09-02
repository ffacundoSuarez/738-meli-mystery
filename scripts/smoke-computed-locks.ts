/**
 * Smoke: locks se aplican antes de computed (A21 Falabella+Chile → A21.2 = 0.00).
 * Ejecutar: npx tsx scripts/smoke-computed-locks.ts
 */
import { surveySections } from '../lib/survey-config';
import {
  applyComputedAnswers,
  getAllQuestions,
} from '../lib/survey-logic';
import type { AnswerValue } from '../lib/types';

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL ${msg}`);
    failed++;
  } else {
    console.log(`OK ${msg}`);
  }
}

const questions = getAllQuestions(surveySections);

/** Base mínima para que applyComputedAnswers / listingFacts no fallen. */
function baseAnswers(
  overrides: Record<string, AnswerValue>
): Record<string, AnswerValue> {
  return {
    'f1-pais': '1',
    'q8-competidor': 'falabella',
    'q12-precio': '10000',
    'q12-1-moneda': '1',
    'q19-precio-envio': '0',
    'q19-1-moneda-envio': '1',
    'q19a-precio-impuestos': '0',
    'q19a-1-moneda-impuestos': '1',
    'q46c-precio-final': '10000',
    'q46c-1-moneda': '1',
    ...overrides,
  };
}

// --- Caso 1: Falabella + Chile — A21 crudo obsoleto, lock fuerza 0 → A21.2 = 0.00
{
  const raw = baseAnswers({
    'q8-competidor': 'falabella',
    'f1-pais': '1',
    'q19a-precio-impuestos': '3771', // valor crudo que antes dejaba A21.2 = 3.96
    'q19a-1-moneda-impuestos': '1',
    'q19b-impuestos-usd': '3.96', // stale en jsonb
  });
  const next = applyComputedAnswers(questions, raw);
  assert(next['q19a-precio-impuestos'] === '0', 'Falabella+CL: A21 locked a 0');
  assert(
    next['q19b-impuestos-usd'] === '0.00',
    `Falabella+CL: A21.2 = 0.00 (got ${String(next['q19b-impuestos-usd'])})`
  );
}

// --- Caso 2: Amazon + Chile — sin lock de impuestos, USD desde monto crudo
{
  const raw = baseAnswers({
    'q8-competidor': 'amazon',
    'f1-pais': '1',
    'q19a-precio-impuestos': '3771',
    'q19a-1-moneda-impuestos': '1',
  });
  const next = applyComputedAnswers(questions, raw);
  assert(
    next['q19a-precio-impuestos'] === '3771',
    'Amazon+CL: A21 no locked (queda 3771)'
  );
  assert(
    next['q19b-impuestos-usd'] === '3.96',
    `Amazon+CL: A21.2 = 3.96 (got ${String(next['q19b-impuestos-usd'])})`
  );
}

// --- Caso 3: F13.3 — con A21 locked a 0, totales cierran → VERDADERO
{
  // 10000 CLP * 0.00105 = 10.50 USD; envío 0; impuestos 0 → total 10.50
  const raw = baseAnswers({
    'q8-competidor': 'falabella',
    'f1-pais': '1',
    'q12-precio': '10000',
    'q12-1-moneda': '1',
    'q19-precio-envio': '0',
    'q19-1-moneda-envio': '1',
    'q19a-precio-impuestos': '3771', // se pisa a 0 por lock
    'q19a-1-moneda-impuestos': '1',
    'q46c-precio-final': '10000',
    'q46c-1-moneda': '1',
  });
  const next = applyComputedAnswers(questions, raw);
  assert(
    next['q46c-3-totales-ok'] === 'VERDADERO',
    `F13.3 VERDADERO con A21 locked (got ${String(next['q46c-3-totales-ok'])})`
  );
  assert(next['q19b-impuestos-usd'] === '0.00', 'F13.3 case: A21.2 sigue en 0.00');
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll smoke-computed-locks checks passed');
