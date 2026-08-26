/**
 * Smoke: motor de cruces URL + Vision vs respuestas.
 * Ejecutar: npx tsx scripts/smoke-cross-checks.ts
 */
import { computeCrossChecks, textsLookSimilar } from '../lib/cross-checks';
import { isQuestionAnswered } from '../lib/survey-logic';
import type { AnswerValue, EvidenceFile, Question } from '../lib/types';
import { LISTING_FACTS_KEY } from '../lib/types';

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL ${msg}`);
    failed++;
  } else {
    console.log(`OK ${msg}`);
  }
}

const a17Q: Question = {
  id: 'q17-imagen-producto',
  text: 'A17',
  type: 'evidence',
  required: true,
};

const answersBase: Record<string, AnswerValue> = {
  'q04-titulo-publicacion': 'Set De 2 Toallas De Mano Franja Blanca',
  'q05-link-publicacion':
    'https://www.falabella.com/falabella-cl/product/882522125/Set-De-2-Toallas-De-Mano-Franja-Blanca-Algodon-500-G-Casa-Cantabria/882522125',
  'q06-codigo-compra': '882522125',
  'q8-competidor': 'falabella',
  'q12-precio': '12990',
  'q12-1-moneda': '1',
  'q14-vendido-por': 'falabella',
  'q16-inventario': '1p',
  [LISTING_FACTS_KEY]: {
    source: 'url',
    inputUrl:
      'https://www.falabella.com/falabella-cl/product/882522125/Set-De-2-Toallas-De-Mano-Franja-Blanca-Algodon-500-G-Casa-Cantabria/882522125',
    parseOk: true,
    marketplace: 'falabella',
    countryCode: '1',
    productId: '882522125',
    slug: 'Set De 2 Toallas De Mano Franja Blanca Algodon 500 G Casa Cantabria',
    extractedAt: new Date().toISOString(),
  },
};

const visionFile: EvidenceFile = {
  url: 'https://example.com/a17.jpg',
  name: 'a17.jpg',
  type: 'image/jpeg',
  validation: {
    status: 'ok',
    confidence: 0.9,
    reason: 'Publicación visible',
    facts: {
      title: 'Set de 2 toallas de mano franja blanca',
      price: 12990,
      currency: 'CLP',
      soldBy: 'Falabella',
      marketplaceVisible: 'falabella',
    },
  },
};

assert(
  textsLookSimilar('Camara 4 lentes HD', 'Cámara de 4 lentes HD 1080p') === true,
  'textsLookSimilar título parecido'
);
assert(
  textsLookSimilar('Zapatillas rojas', 'Mouse inalámbrico') === false,
  'textsLookSimilar título distinto'
);

const withVision = {
  ...answersBase,
  'q17-imagen-producto': [visionFile],
};
const checks = computeCrossChecks(withVision);
assert(checks['a04-title-vs-url-slug']?.status === 'match', 'cruce título vs slug');
assert(checks['a04-title-vs-a17']?.status === 'match', 'cruce título vs A17');
assert(checks['a07-marketplace-vs-url']?.status === 'match', 'cruce marketplace vs URL');
assert(checks['a11-price-vs-a17']?.status === 'match', 'cruce precio vs A17');
assert(checks['a13-soldby-vs-a17']?.status === 'match', 'cruce vendido por vs A17');
assert(checks['a06-code-vs-url']?.status === 'match', 'cruce A06 vs URL');

assert(
  isQuestionAnswered(a17Q, {
    'q17-imagen-producto': [
      {
        ...visionFile,
        validation: { status: 'invalid', confidence: 0.2, reason: 'test' },
      },
    ],
  }),
  'A17 invalid no bloquea avance'
);

const mismatch = computeCrossChecks({
  ...withVision,
  'q04-titulo-publicacion': 'Producto totalmente diferente xyz',
});
assert(
  mismatch['a04-title-vs-a17']?.status === 'mismatch',
  'mismatch título vs A17'
);

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nAll cross-check smoke tests passed.');
