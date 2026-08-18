import { COMPETIDOR_SLUGS } from '@/lib/survey-config/constants';
import { EvidenceFile, EvidenceValidation, Question } from '@/lib/types';

const MARKETPLACE_SET = new Set<string>(COMPETIDOR_SLUGS);

/** Slug de A07 si es Amazon / Falabella / Temu. */
export function normalizeMarketplace(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const slug = value.trim().toLowerCase();
  return MARKETPLACE_SET.has(slug) ? slug : undefined;
}

/** Llama al BFF de validación Vision; fail-soft si falla la red. */
export async function validateEvidenceFile(
  file: EvidenceFile,
  question: Question,
  marketplace?: string
): Promise<EvidenceValidation> {
  try {
    const res = await fetch('/api/evidencia/validar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: file.url,
        questionId: question.id,
        questionText: question.text,
        hint: question.hint,
        marketplace: normalizeMarketplace(marketplace),
      }),
    });
    if (!res.ok) {
      return {
        status: 'doubt',
        confidence: 0,
        reason: 'validation_unavailable',
      };
    }
    const data = await res.json();
    return {
      status:
        data.status === 'ok' ||
        data.status === 'doubt' ||
        data.status === 'invalid'
          ? data.status
          : 'doubt',
      confidence: typeof data.confidence === 'number' ? data.confidence : 0.5,
      reason:
        typeof data.reason === 'string'
          ? data.reason
          : 'validation_unavailable',
      detectedLabel:
        typeof data.detectedLabel === 'string' ? data.detectedLabel : undefined,
    };
  } catch {
    return {
      status: 'doubt',
      confidence: 0,
      reason: 'validation_unavailable',
    };
  }
}
