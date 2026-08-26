/**
 * Smoke: normalize listing URL (redirect resolve).
 * Local: parser-only paths. Live (SMOKE_LIVE=1): share.temu.com real redirects.
 *
 *   npx tsx scripts/smoke-listing-normalize.ts
 *   SMOKE_LIVE=1 npx tsx scripts/smoke-listing-normalize.ts
 */
import {
  clearListingNormalizeCache,
  normalizeListingUrl,
} from '../lib/listing-normalize';
import { buildListingFacts, parseListingUrlWithMeta } from '../lib/survey-config/listing-url';

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL ${msg}`);
    failed++;
  } else {
    console.log(`OK ${msg}`);
  }
}

async function main() {
  clearListingNormalizeCache();

  const canonical = await normalizeListingUrl(
    'https://www.falabella.com/falabella-cl/product/882522125/Set-De-2-Toallas-De-Mano-Franja-Blanca-Algodon-500-G-Casa-Cantabria/882522125',
    { expectedMarketplace: 'falabella', expectedCountry: '1', skipCache: true }
  );
  assert(canonical.parse.ok === true, 'normalize Falabella local OK');
  assert(canonical.facts.parseOk === true, 'normalize Falabella facts OK');
  if (canonical.parse.ok) {
    assert(
      canonical.facts.slug?.toLowerCase().includes('toallas') === true,
      'normalize Falabella slug'
    );
  }

  const cart = await normalizeListingUrl(
    'https://www.temu.com/shopping_cart.html?refer_page_sn=10032',
    { skipCache: true }
  );
  assert(cart.parse.ok === false, 'normalize Temu cart fail-soft');
  assert(cart.facts.parseOk === false, 'normalize Temu cart facts');

  const shareLocal = await normalizeListingUrl(
    'https://share.temu.com/5crYUxHUpzA',
    { expectedMarketplace: 'temu', skipCache: true }
  );
  if (process.env.SMOKE_LIVE === '1') {
    assert(shareLocal.facts.source === 'url-resolved', 'live share source resolved');
    assert(shareLocal.parse.ok === true, 'live share parse OK');
    if (shareLocal.parse.ok) {
      assert(
        Boolean(shareLocal.facts.goodsId || shareLocal.parse.productId),
        'live share tiene ID o goods_id'
      );
    }
    console.log(
      '  → canonical:',
      (shareLocal.facts.canonicalUrl ?? '').slice(0, 96)
    );
  } else {
    // Con red puede resolverse; sin red queda needsResolve. Ambos son fail-soft válidos.
    assert(
      shareLocal.facts.parseOk === true ||
        shareLocal.facts.parseCode === 'needsResolve',
      'share normalize fail-soft (resolved o needsResolve)'
    );
    if (shareLocal.facts.parseOk) {
      assert(
        shareLocal.facts.source === 'url-resolved',
        'share resuelto marca source url-resolved'
      );
    }
  }

  const meta = parseListingUrlWithMeta(
    'https://www.temu.com/goods.html?goods_id=601099621732248&sku_id=17592606988929'
  );
  assert(meta.parse.ok === true, 'meta goods.html OK');
  const facts = buildListingFacts(
    'https://www.temu.com/goods.html?goods_id=601099621732248&sku_id=17592606988929',
    meta.parse,
    { meta: meta.meta }
  );
  assert(facts.productId === '17592606988929', 'facts productId sku_id');
  assert(facts.goodsId === '601099621732248', 'facts goodsId separado');

  if (failed > 0) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
  }
  console.log('\nAll listing normalize smoke tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
