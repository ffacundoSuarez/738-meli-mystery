import { NextRequest, NextResponse } from 'next/server';

/**
 * BFF: proxy a Lightsail para validar evidencias con GPT Vision.
 * La MELI_SERVICE_KEY no se expone al browser.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, questionId, questionText, hint } = body || {};

    if (
      typeof imageUrl !== 'string' ||
      !imageUrl ||
      typeof questionId !== 'string' ||
      !questionId
    ) {
      return NextResponse.json(
        { error: 'imageUrl and questionId are required' },
        { status: 400 }
      );
    }

    const baseUrl = process.env.LIGHTSAIL_EVIDENCE_URL;
    const serviceKey = process.env.MELI_SERVICE_KEY;

    if (!baseUrl || !serviceKey) {
      // Fail-soft: sin infra configurada no rompemos el upload
      return NextResponse.json({
        status: 'doubt',
        confidence: 0,
        reason: 'validation_unavailable',
        detectedLabel: 'env_not_configured',
      });
    }

    const url = `${baseUrl.replace(/\/$/, '')}/meli/validate-evidence`;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-meli-service-key': serviceKey,
      },
      body: JSON.stringify({
        imageUrl,
        questionId,
        questionText:
          typeof questionText === 'string' ? questionText : undefined,
        hint: typeof hint === 'string' ? hint : undefined,
      }),
      // Vision puede tardar
      signal: AbortSignal.timeout(60000),
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      console.error('[evidencia/validar] upstream', upstream.status, text);
      return NextResponse.json({
        status: 'doubt',
        confidence: 0,
        reason: 'validation_unavailable',
        detectedLabel: 'upstream_error',
      });
    }

    const result = await upstream.json();
    return NextResponse.json({
      status:
        result.status === 'ok' ||
        result.status === 'doubt' ||
        result.status === 'invalid'
          ? result.status
          : 'doubt',
      confidence:
        typeof result.confidence === 'number' ? result.confidence : 0.5,
      reason:
        typeof result.reason === 'string'
          ? result.reason
          : 'validation_unavailable',
      detectedLabel:
        typeof result.detectedLabel === 'string'
          ? result.detectedLabel
          : undefined,
    });
  } catch (err) {
    console.error('[evidencia/validar]', err);
    return NextResponse.json({
      status: 'doubt',
      confidence: 0,
      reason: 'validation_unavailable',
      detectedLabel: 'bff_error',
    });
  }
}
