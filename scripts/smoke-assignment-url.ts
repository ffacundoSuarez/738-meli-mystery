/**
 * Smoke: parser de título de encuesta + URL A05 + código A06.
 * Ejecutar: npx tsx scripts/smoke-assignment-url.ts
 */
import {
  checkAssignmentMatch,
  lockedValueFromAssignment,
  parseAssignmentTitle,
} from '../lib/survey-config/assignment-title';
import {
  crossCheckPurchaseCodeWithUrl,
  parseListingUrl,
  validatePurchaseCode,
} from '../lib/survey-config/listing-url';
import {
  getLockedValue,
  isQuestionAnswered,
  validateListingUrlField,
  validatePurchaseCodeField,
} from '../lib/survey-logic';
import type { Question } from '../lib/types';

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL ${msg}`);
    failed++;
  } else {
    console.log(`OK ${msg}`);
  }
}

// --- Título de asignación -------------------------------------------------

const t1 = parseAssignmentTitle('168CHI CONCEPCIÓN TEMU FULL');
assert(t1?.countryCode === '1', '168CHI → Chile');
assert(t1?.cityCode === 'concepcion', 'CONCEPCIÓN → concepcion');
assert(t1?.marketplace === 'temu', 'TEMU → temu');
assert(t1?.summary === 'Temu · Concepción · Chile', 'summary Temu Concepción');

const t2 = parseAssignmentTitle('96CHI SANTIAGO TEMU FULL');
assert(t2?.cityCode === 'santiago' && t2?.marketplace === 'temu', 'Santiago Temu');

const t3 = parseAssignmentTitle('12COL BOGOTÁ AMAZON FULL');
assert(
  t3?.countryCode === '2' &&
    t3?.cityCode === 'bogota' &&
    t3?.marketplace === 'amazon',
  'Bogotá Amazon COL'
);

const t4 = parseAssignmentTitle('01CHI ANTOFAGASTA FALABELLA FULL');
assert(t4?.marketplace === 'falabella' && t4?.cityCode === 'antofagasta', 'Falabella Antofagasta');

assert(parseAssignmentTitle('Juan Pérez') === null, 'nombre persona → null');
assert(parseAssignmentTitle('') === null, 'vacío → null');

assert(
  lockedValueFromAssignment('marketplace', {
    'nombre-apellido': '168CHI CONCEPCIÓN TEMU FULL',
  }) === 'temu',
  'lock marketplace from title'
);
assert(
  lockedValueFromAssignment('city', {
    'nombre-apellido': '168CHI CONCEPCIÓN TEMU FULL',
  }) === 'concepcion',
  'lock city from title'
);

const matchMp = checkAssignmentMatch(
  {
    'nombre-apellido': '168CHI CONCEPCIÓN TEMU FULL',
    'q8-competidor': 'temu',
  },
  'marketplace'
);
assert(matchMp?.status === 'match', 'assignment marketplace match');

const mismatchMp = checkAssignmentMatch(
  {
    'nombre-apellido': '168CHI CONCEPCIÓN TEMU FULL',
    'q8-competidor': 'falabella',
  },
  'marketplace'
);
assert(mismatchMp?.status === 'mismatch', 'assignment marketplace mismatch');

const lockQ: Question = {
  id: 'q8-competidor',
  text: 'A07',
  type: 'single',
  assignmentLock: 'marketplace',
};
assert(
  getLockedValue(lockQ, {
    'nombre-apellido': '01CHI SANTIAGO FALABELLA FULL',
  }) === 'falabella',
  'getLockedValue assignmentLock'
);

// --- URL listing ----------------------------------------------------------

const temuOk = parseListingUrl(
  'https://www.temu.com/cl/camara-de-tablero-de-4-con-camaras-g-601099512345678.html?goods_id=601099512345678',
  { expectedMarketplace: 'temu', expectedCountry: '1' }
);
assert(temuOk.ok === true, 'Temu product URL ok');
if (temuOk.ok) {
  assert(temuOk.marketplace === 'temu', 'Temu marketplace');
  assert(temuOk.countryCode === '1', 'Temu /cl/ → Chile');
  assert(Boolean(temuOk.productId), 'Temu productId');
}

const temuJpeg = parseListingUrl(
  'https://www.temu.com/cl/camara-de-tablero-de--de-4--con-camaras-frontal-de-1080p-y-3-camaras-envolventes-de-480p-izquierda-derecha-interior-trasera-8-led-ir--goods.jpeg&spec_gallery_id=35343088008',
  { expectedMarketplace: 'temu', expectedCountry: '1' }
);
assert(temuJpeg.ok === false && !temuJpeg.ok && temuJpeg.code === 'imageUrl', 'Temu .jpeg bloqueado');

const falabellaOk = parseListingUrl(
  'https://www.falabella.com/falabella-cl/product/12345678/Mouse-Inalambrico/12345678',
  { expectedMarketplace: 'falabella', expectedCountry: '1' }
);
assert(falabellaOk.ok === true, 'Falabella CL URL ok');

const amazonOk = parseListingUrl(
  'https://www.amazon.com.co/Some-Product-Name/dp/B0EXAMPLE1',
  { expectedMarketplace: 'amazon', expectedCountry: '2' }
);
assert(amazonOk.ok === true, 'Amazon CO URL ok');
if (amazonOk.ok) {
  assert(amazonOk.productId === 'B0EXAMPLE1', 'Amazon ASIN');
}

const wrongMp = parseListingUrl(
  'https://www.temu.com/cl/producto-g-123456789.html',
  { expectedMarketplace: 'falabella', expectedCountry: '1' }
);
assert(
  wrongMp.ok === false && !wrongMp.ok && wrongMp.code === 'marketplaceMismatch',
  'marketplace mismatch bloquea'
);

const wrongCountry = parseListingUrl(
  'https://www.temu.com/co/producto-g-123456789.html',
  { expectedMarketplace: 'temu', expectedCountry: '1' }
);
assert(
  wrongCountry.ok === false &&
    !wrongCountry.ok &&
    wrongCountry.code === 'countryMismatch',
  'country mismatch bloquea'
);

assert(
  validateListingUrlField('asdf', { 'f1-pais': '1', 'q8-competidor': 'temu' })
    .level === 'error',
  'listingUrl asdf → error'
);

// --- A06 purchase code ----------------------------------------------------

assert(validatePurchaseCode('.').level === 'error', 'A06 "." error');
assert(validatePurchaseCode('...').level === 'error', 'A06 "..." error');
assert(validatePurchaseCode('n/a').level === 'error', 'A06 n/a error');
assert(validatePurchaseCode('ok').level === 'error', 'A06 ok error');
assert(validatePurchaseCode('12345').level === 'error', 'A06 corto error');
assert(validatePurchaseCode('ORD-123456').level === 'ok', 'A06 código ok');
assert(
  validatePurchaseCodeField('.').level === 'error',
  'validatePurchaseCodeField "."'
);

const a06Q: Question = {
  id: 'q06-codigo-compra',
  text: 'A06',
  type: 'text',
  required: true,
  validate: 'purchaseCode',
};
assert(
  !isQuestionAnswered(a06Q, { 'q06-codigo-compra': '.' }),
  'isQuestionAnswered bloquea "."'
);
assert(
  isQuestionAnswered(a06Q, { 'q06-codigo-compra': 'PEDIDO998877' }),
  'isQuestionAnswered acepta código'
);

const a05Q: Question = {
  id: 'q05-link-publicacion',
  text: 'A05',
  type: 'text',
  required: true,
  validate: 'listingUrl',
};
assert(
  isQuestionAnswered(a05Q, {
    'q05-link-publicacion':
      'https://www.temu.com/cl/foto.jpeg?spec_gallery_id=1',
    'q8-competidor': 'temu',
    'f1-pais': '1',
  }),
  'isQuestionAnswered acepta jpeg (ya no bloquea A05)'
);

const cross = crossCheckPurchaseCodeWithUrl(
  '601099512345678',
  'https://www.temu.com/cl/prod-g-601099512345678.html'
);
assert(cross.status === 'match', 'A06 cruza con ID URL');

const crossMiss = crossCheckPurchaseCodeWithUrl(
  'PEDIDO999',
  'https://www.temu.com/cl/prod-g-601099512345678.html'
);
assert(crossMiss.status === 'mismatch', 'A06 no cruza → mismatch aviso');

// --- Falabella Chile tax lock ---------------------------------------------

const taxQ: Question = {
  id: 'q19a-precio-impuestos',
  text: 'A21',
  type: 'number',
  required: true,
  lockedRules: [
    {
      if: {
        all: [
          { questionId: 'q8-competidor', values: ['falabella'] },
          { questionId: 'f1-pais', values: ['1'] },
        ],
      },
      value: '0',
    },
  ],
};
assert(
  getLockedValue(taxQ, {
    'q8-competidor': 'falabella',
    'f1-pais': '1',
  }) === '0',
  'Falabella Chile → impuesto 0'
);
assert(
  getLockedValue(taxQ, {
    'q8-competidor': 'falabella',
    'f1-pais': '2',
  }) === undefined,
  'Falabella Colombia → impuesto libre'
);
assert(
  getLockedValue(taxQ, {
    'q8-competidor': 'temu',
    'f1-pais': '1',
  }) === undefined,
  'Temu Chile → impuesto libre'
);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nAll assignment/url smoke tests passed.');
