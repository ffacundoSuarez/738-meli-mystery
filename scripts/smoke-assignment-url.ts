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
  assert(temuOk.productId === '601099512345678', 'Temu productId desde -g-');
}

const temuJpeg = parseListingUrl(
  'https://www.temu.com/cl/camara-de-tablero-de--de-4--con-camaras-frontal-de-1080p-y-3-camaras-envolventes-de-480p-izquierda-derecha-interior-trasera-8-led-ir--goods.jpeg&spec_gallery_id=35343088008',
  { expectedMarketplace: 'temu', expectedCountry: '1' }
);
assert(temuJpeg.ok === false && !temuJpeg.ok && temuJpeg.code === 'imageUrl', 'Temu .jpeg bloqueado');

// Share con top_gallery_url=...jpeg en query: NO es imagen de ficha
const temuShareGallery = parseListingUrl(
  'https://www.temu.com/co/jeans-de-talla-grande.html?top_gallery_url=https%3A%2F%2Fimg.temu.com%2Ffoo.jpeg&sku_id=17592606988929&goods_id=601099621732248',
  { expectedMarketplace: 'temu', expectedCountry: '2' }
);
assert(temuShareGallery.ok === true, 'Temu share con gallery jpeg en query OK');
if (temuShareGallery.ok) {
  assert(
    temuShareGallery.productId === '17592606988929',
    'Temu sin -g- usa sku_id (no goods_id)'
  );
}

const temuWithGAndSku = parseListingUrl(
  'https://www.temu.com/cl/prod-g-999888777666.html?sku_id=111222333444&goods_id=555',
  { expectedMarketplace: 'temu', expectedCountry: '1' }
);
assert(temuWithGAndSku.ok === true, 'Temu con g- y sku');
if (temuWithGAndSku.ok) {
  assert(
    temuWithGAndSku.productId === '999888777666',
    'Temu prioriza -g- sobre sku_id'
  );
}

const falabellaOk = parseListingUrl(
  'https://www.falabella.com/falabella-cl/product/12345678/Mouse-Inalambrico/12345678',
  { expectedMarketplace: 'falabella', expectedCountry: '1' }
);
assert(falabellaOk.ok === true, 'Falabella CL URL ok');
if (falabellaOk.ok) {
  assert(falabellaOk.productId === '12345678', 'Falabella ID catálogo');
  assert(
    falabellaOk.slug?.includes('Mouse') === true,
    'Falabella slug desde título'
  );
}

// Fixtures reales Ops (Falabella)
const fbToallas = parseListingUrl(
  'https://www.falabella.com/falabella-cl/product/882522125/Set-De-2-Toallas-De-Mano-Franja-Blanca-Algodon-500-G-Casa-Cantabria/882522125',
  { expectedMarketplace: 'falabella', expectedCountry: '1' }
);
assert(fbToallas.ok === true, 'Falabella toallas OK');
if (fbToallas.ok) {
  assert(fbToallas.productId === '882522125', 'Falabella toallas ID');
  assert(
    fbToallas.slug?.toLowerCase().includes('toallas') === true,
    'Falabella toallas slug'
  );
}

const fbAdidas = parseListingUrl(
  'https://www.falabella.com/falabella-cl/product/16682669/Polera-Deportiva-Sports-T-Shirts-Manga-Corta-Hombre-Adidas/17015613',
  { expectedMarketplace: 'falabella', expectedCountry: '1' }
);
assert(fbAdidas.ok === true, 'Falabella adidas OK');
if (fbAdidas.ok) {
  assert(fbAdidas.productId === '16682669', 'Falabella adidas ID catálogo');
}

// Amazon .com aceptado (sin país inferido)
const amzDesk = parseListingUrl(
  'https://www.amazon.com/-/es/Newhouse-Lighting-NHDK-OX-BK-escritorio-bombilla/dp/B0HCXNJ2QJ/ref=sr_1_18?th=1'
);
assert(amzDesk.ok === true, 'Amazon .com desk lamp OK');
if (amzDesk.ok) {
  assert(amzDesk.productId === 'B0HCXNJ2QJ', 'Amazon .com ASIN');
  assert(amzDesk.countryCode === undefined, 'Amazon .com sin país');
}

const amzShare = parseListingUrl(
  'https://www.amazon.com/dp/B0BXKTT76W?social_share=cm_sw_r_cso_wa_mwn_ct_T80X2NQH29Z0ESJ5R5A7&th=1'
);
assert(amzShare.ok === true, 'Amazon .com share query OK');
if (amzShare.ok) {
  assert(amzShare.productId === 'B0BXKTT76W', 'Amazon share ASIN');
}

const amzEsDp = parseListingUrl(
  'https://www.amazon.com/-/es/dp/B000GBGJLW?ref=ppx_yo2ov_dt_b_fed_asin_title&th=1'
);
assert(amzEsDp.ok === true, 'Amazon -/es/dp OK');
if (amzEsDp.ok) {
  assert(amzEsDp.productId === 'B000GBGJLW', 'Amazon -/es/dp ASIN');
  assert(amzEsDp.slug !== 'es', 'Amazon slug no es locale es');
}

const temuShareShort = parseListingUrl(
  'https://share.temu.com/5crYUxHUpzA',
  { expectedMarketplace: 'temu' }
);
assert(
  temuShareShort.ok === false &&
    !temuShareShort.ok &&
    temuShareShort.code === 'needsResolve',
  'Temu share.temu → needsResolve'
);

const temuCart = parseListingUrl(
  'https://www.temu.com/shopping_cart.html?_x_sessn_id=d6prr1q9n5&refer_page_name=goods&refer_page_id=id=601101559174887_xwmi782uci&refer_page_sn=10032'
);
assert(
  temuCart.ok === false && !temuCart.ok && temuCart.code === 'notProductPage',
  'Temu shopping_cart → notProduct'
);

const temuGoodsHtml = parseListingUrl(
  'https://www.temu.com/goods.html?goods_id=601099621732248&sku_id=17592606988929'
);
assert(temuGoodsHtml.ok === true, 'Temu goods.html + sku_id OK');
if (temuGoodsHtml.ok) {
  assert(
    temuGoodsHtml.productId === '17592606988929',
    'Temu goods.html usa sku_id'
  );
  assert(temuGoodsHtml.slug === undefined, 'Temu goods.html sin slug genérico');
}

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
assert(cross.status === 'match', 'A06 cruza con ID URL (g-)');

const crossSku = crossCheckPurchaseCodeWithUrl(
  '17592606988929',
  'https://www.temu.com/co/jeans.html?sku_id=17592606988929&goods_id=601099621732248'
);
assert(crossSku.status === 'match', 'A06 cruza con sku_id (no goods_id)');

const crossMiss = crossCheckPurchaseCodeWithUrl(
  'PEDIDO999',
  'https://www.temu.com/cl/prod-g-601099512345678.html'
);
assert(crossMiss.status === 'mismatch', 'A06 no cruza → mismatch aviso');

// --- A14 Player lock ------------------------------------------------------

const a14Q: Question = {
  id: 'q15-logistica',
  text: 'A14',
  type: 'single',
  lockedIf: { questionId: 'f1-pais', values: ['1', '2'] },
  lockedValue: '1',
};
assert(
  getLockedValue(a14Q, { 'f1-pais': '1' }) === '1',
  'A14 locked Player en Chile'
);

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
