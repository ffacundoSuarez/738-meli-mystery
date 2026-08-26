import { NextRequest, NextResponse } from 'next/server';
import { normalizeListingUrl } from '@/lib/listing-normalize';

/**
 * BFF: normaliza URL de publicación (A05).
 * Parse local + resolve de share/acortadores. Fail-soft siempre.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, expectedMarketplace, expectedCountry } = body || {};

    if (typeof url !== 'string' || !url.trim()) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    const result = await normalizeListingUrl(url.trim(), {
      expectedMarketplace:
        typeof expectedMarketplace === 'string'
          ? expectedMarketplace
          : undefined,
      expectedCountry:
        expectedCountry === '1' || expectedCountry === '2'
          ? expectedCountry
          : undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[listing/normalize]', err);
    return NextResponse.json({
      parse: {
        ok: false,
        code: 'needsResolve',
        messageKey: 'listingUrlNeedsResolve',
      },
      facts: {
        source: 'url',
        inputUrl: '',
        parseOk: false,
        parseCode: 'needsResolve',
        extractedAt: new Date().toISOString(),
      },
    });
  }
}
