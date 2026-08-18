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

/** Tramos D03 (antes 55a): 0–6 / 7–8 / 9–10 */
const band06 = {
  all: [
    { questionId: 'q55a-facilidad', operator: 'gte', values: ['0'] },
    { questionId: 'q55a-facilidad', operator: 'lte', values: ['6'] },
  ],
};
const band78 = {
  all: [
    { questionId: 'q55a-facilidad', operator: 'gte', values: ['7'] },
    { questionId: 'q55a-facilidad', operator: 'lte', values: ['8'] },
  ],
};
const band910 = {
  all: [
    { questionId: 'q55a-facilidad', operator: 'gte', values: ['9'] },
    { questionId: 'q55a-facilidad', operator: 'lte', values: ['10'] },
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
  const answers = { 'q55a-facilidad': String(score) };
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
if (evaluateCondition(band06, { 'q55a-facilidad': 'abc' }) !== false) {
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

// D00 gate: D01 solo si D00 = 1
const d01Gate = { questionId: 'q-d00-cambio-fecha', values: ['1'] };
if (evaluateCondition(d01Gate, { 'q-d00-cambio-fecha': '1' }) !== true) {
  console.error('FAIL D00=1 should show D01');
  failed++;
} else {
  console.log('OK D00=1 shows D01');
}
if (evaluateCondition(d01Gate, { 'q-d00-cambio-fecha': '2' }) !== false) {
  console.error('FAIL D00=2 should hide D01');
  failed++;
} else {
  console.log('OK D00=2 hides D01');
}

// D03–D04 solo si D02 = 1
const d02Gate = { questionId: 'q55-1-contactar-vendedor', values: ['1'] };
const d031 = {
  all: [
    { questionId: 'q55-1-contactar-vendedor', values: ['1'] },
    { questionId: 'q55a-facilidad', operator: 'gte', values: ['0'] },
    { questionId: 'q55a-facilidad', operator: 'lte', values: ['6'] },
  ],
};
if (evaluateCondition(d02Gate, { 'q55-1-contactar-vendedor': '1' }) !== true) {
  console.error('FAIL D02=1 should show D03');
  failed++;
} else {
  console.log('OK D02=1 shows D03');
}
if (evaluateCondition(d02Gate, { 'q55-1-contactar-vendedor': '2' }) !== false) {
  console.error('FAIL D02=2 should hide D03');
  failed++;
} else {
  console.log('OK D02=2 hides D03');
}
if (
  evaluateCondition(d031, {
    'q55-1-contactar-vendedor': '1',
    'q55a-facilidad': '4',
  }) !== true
) {
  console.error('FAIL D02=1 score 4 should show D03.1');
  failed++;
} else {
  console.log('OK D02=1 score 4 shows D03.1');
}
if (
  evaluateCondition(d031, {
    'q55-1-contactar-vendedor': '2',
    'q55a-facilidad': '4',
  }) !== false
) {
  console.error('FAIL D02=2 should hide D03.1 even with score');
  failed++;
} else {
  console.log('OK D02=2 hides D03.1');
}

// A11B reemplaza A11 en el verdadero/falso cuando está respondida (0 cuenta)
function pickProductSource(answers) {
  const raw = answers['q12b-precio-a11b'];
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    return 'a11b';
  }
  return 'a11';
}
if (pickProductSource({ 'q12b-precio-a11b': '100' }) !== 'a11b') {
  console.error('FAIL A11B answered should replace A11');
  failed++;
} else {
  console.log('OK A11B replaces A11');
}
if (pickProductSource({ 'q12b-precio-a11b': '0' }) !== 'a11b') {
  console.error('FAIL A11B=0 should replace A11');
  failed++;
} else {
  console.log('OK A11B=0 replaces A11');
}
if (pickProductSource({ 'q12b-precio-a11b': '' }) !== 'a11') {
  console.error('FAIL empty A11B should keep A11');
  failed++;
} else {
  console.log('OK empty A11B keeps A11');
}
if (pickProductSource({}) !== 'a11') {
  console.error('FAIL missing A11B should keep A11');
  failed++;
} else {
  console.log('OK missing A11B keeps A11');
}

// D08 evidencia no required: vacía no bloquea
function evidenceAnswered(required, value) {
  if (!required) return true;
  return Array.isArray(value) && value.length > 0;
}
if (evidenceAnswered(false, undefined) !== true) {
  console.error('FAIL optional evidence empty should pass');
  failed++;
} else {
  console.log('OK D08 empty does not block');
}
if (evidenceAnswered(true, undefined) !== false) {
  console.error('FAIL required evidence empty should block');
  failed++;
} else {
  console.log('OK required evidence empty blocks');
}

// A11B opcional: vacío no bloquea
function optionalNumberAnswered(required, value) {
  if (required === false && (value === undefined || value === '')) return true;
  return value !== undefined && String(value).trim() !== '';
}
if (optionalNumberAnswered(false, '') !== true) {
  console.error('FAIL optional A11B empty should pass');
  failed++;
} else {
  console.log('OK A11B empty does not block');
}

// --- Validaciones Maia: período de campo + historial C07 -------------------

function isIsoDate(value) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(String(value).trim().slice(0, 10)));
}

function isDateInFieldPeriod(date, start, end) {
  if (!isIsoDate(date)) return true;
  const d = date.trim().slice(0, 10);
  const hasStart = isIsoDate(start);
  const hasEnd = isIsoDate(end);
  if (!hasStart && !hasEnd) return true;
  if (hasStart && d < start.trim().slice(0, 10)) return false;
  if (hasEnd && d > end.trim().slice(0, 10)) return false;
  return true;
}

function isDateOutsideFieldPeriod(date, answers) {
  if (!date?.trim()) return false;
  const startRaw = answers['fecha-inicio'];
  const endRaw = answers['fecha-fin'];
  const start = typeof startRaw === 'string' && isIsoDate(startRaw) ? startRaw.trim().slice(0, 10) : undefined;
  const end = typeof endRaw === 'string' && isIsoDate(endRaw) ? endRaw.trim().slice(0, 10) : undefined;
  if (!start && !end) return false;
  return !isDateInFieldPeriod(date, start, end);
}

const TRACKING_TRASH = /^(test|asdf|xxx+|aaa+|hola|ok|n\/a|na|ninguno|\.+|123+|abc+)$/i;

function validateTrackingHistory(text) {
  const trimmed = text.trim();
  if (!trimmed) return { level: 'error' };
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (TRACKING_TRASH.test(trimmed) || trimmed.length < 40) {
    return { level: 'error' };
  }
  if (lines.length < 2 && trimmed.length < 80) {
    return { level: 'error' };
  }
  let signals = 0;
  if (lines.length >= 3) signals++;
  if (/rastreo|tracking|\bid[\s.:\/]\b|\b[A-Z]{2,}\d{6,}\b/i.test(trimmed)) signals++;
  if (
    /lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}\s+de\s+\w+|[ap]\.\s*m\.|\d{1,2}:\d{2}/i.test(
      trimmed
    )
  ) {
    signals++;
  }
  if (/entregad|reparto|en camino|despach|tr[aá]nsito|paquete|enviado|lleg[oó]|recibid/i.test(trimmed)) {
    signals++;
  }
  if (signals < 2) return { level: 'warn' };
  return { level: 'ok' };
}

const periodAnswers = { 'fecha-inicio': '2026-08-01', 'fecha-fin': '2026-08-31' };

if (isDateOutsideFieldPeriod('2026-08-15', periodAnswers) !== false) {
  console.error('FAIL date inside period should not warn');
  failed++;
} else {
  console.log('OK date inside field period');
}

if (isDateOutsideFieldPeriod('2026-07-15', periodAnswers) !== true) {
  console.error('FAIL date before period should warn');
  failed++;
} else {
  console.log('OK date before field period warns');
}

if (isDateOutsideFieldPeriod('2026-09-01', periodAnswers) !== true) {
  console.error('FAIL date after period should warn');
  failed++;
} else {
  console.log('OK date after field period warns');
}

if (isDateOutsideFieldPeriod('2026-01-01', {}) !== false) {
  console.error('FAIL without period bounds should not warn');
  failed++;
} else {
  console.log('OK no field period bounds');
}

if (validateTrackingHistory('test').level !== 'error') {
  console.error('FAIL "test" should be error');
  failed++;
} else {
  console.log('OK C07 trash blocked');
}

if (
  validateTrackingHistory(
    'hola esto es un texto bastante largo pero sin estructura de historial de envio ni fechas ni estados del paquete en absoluto'
  ).level !== 'warn'
) {
  console.error('FAIL weak structure should warn');
  failed++;
} else {
  console.log('OK C07 weak structure warns');
}

const goodTracking = `Enviado con PASAREX
ID de rastreo: AMZPSR021029556
lunes, 2 de febrero
12:21 p. m.
Paquete entregado al cliente.
Medellin, CO`;

if (validateTrackingHistory(goodTracking).level !== 'ok') {
  console.error('FAIL good tracking should be ok');
  failed++;
} else {
  console.log('OK C07 good tracking');
}

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nAll smoke tests passed.');
