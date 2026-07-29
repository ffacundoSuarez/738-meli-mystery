/**
 * Smoke test de operadores numéricos (tramos de 55a) y evaluateClause.
 * Ejecutar: node --experimental-strip-types scripts/smoke-survey-logic.mjs
 * o vía tsx si está disponible. Aquí reimplementamos la lógica mínima en JS
 * para no depender de un bundler.
 */

function parseFiniteNumber(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  return Number.isFinite(n) ? n : null;
}

function evaluateNumeric(operator, left, right) {
  switch (operator) {
    case 'gte':
      return left >= right;
    case 'lte':
      return left <= right;
    case 'gt':
      return left > right;
    case 'lt':
      return left < right;
  }
}

const NUMERIC_OPS = new Set(['gte', 'lte', 'gt', 'lt']);

function evaluateClause(clause, answers) {
  const dependent = answers[clause.questionId];
  const operator = clause.operator ?? 'in';
  const values = clause.values;

  if (dependent === undefined || dependent === null || dependent === '') {
    return operator === 'notIn';
  }

  if (NUMERIC_OPS.has(operator)) {
    const left = parseFiniteNumber(dependent);
    const right = parseFiniteNumber(values[0]);
    if (left === null || right === null) return false;
    return evaluateNumeric(operator, left, right);
  }

  const matchValue = (v) => values.includes(v);
  const str = String(dependent);
  switch (operator) {
    case 'eq':
    case 'in':
      return matchValue(str);
    case 'neq':
    case 'notIn':
      return !matchValue(str);
    default:
      return false;
  }
}

function evaluateCondition(condition, answers) {
  if (!condition) return true;
  if ('all' in condition) {
    return condition.all.every((c) => evaluateClause(c, answers));
  }
  if ('any' in condition) {
    return condition.any.some((c) => evaluateClause(c, answers));
  }
  if ('questionId' in condition) {
    return evaluateClause(condition, answers);
  }
  return true;
}

/** Tramos 55a: 0–6 / 7–8 / 9–10 */
const band06 = {
  all: [
    { questionId: 'q55a', operator: 'gte', values: ['0'] },
    { questionId: 'q55a', operator: 'lte', values: ['6'] },
  ],
};
const band78 = {
  all: [
    { questionId: 'q55a', operator: 'gte', values: ['7'] },
    { questionId: 'q55a', operator: 'lte', values: ['8'] },
  ],
};
const band910 = {
  all: [
    { questionId: 'q55a', operator: 'gte', values: ['9'] },
    { questionId: 'q55a', operator: 'lte', values: ['10'] },
  ],
};

const cases = [
  [0, true, false, false],
  [6, true, false, false],
  [7, false, true, false],
  [8, false, true, false],
  [9, false, false, true],
  [10, false, false, true],
];

let failed = 0;
for (const [score, e06, e78, e910] of cases) {
  const answers = { q55a: String(score) };
  const a = evaluateCondition(band06, answers);
  const b = evaluateCondition(band78, answers);
  const c = evaluateCondition(band910, answers);
  if (a !== e06 || b !== e78 || c !== e910) {
    console.error(`FAIL score=${score}: got [${a},${b},${c}] expected [${e06},${e78},${e910}]`);
    failed++;
  } else {
    console.log(`OK score=${score}`);
  }
}

// No numéricos → false
if (evaluateCondition(band06, { q55a: 'abc' }) !== false) {
  console.error('FAIL non-numeric should be false');
  failed++;
} else {
  console.log('OK non-numeric');
}

if (evaluateCondition(band06, {}) !== false) {
  console.error('FAIL empty should be false for gte/lte');
  failed++;
} else {
  console.log('OK empty');
}

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nAll smoke tests passed.');
