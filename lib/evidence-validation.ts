import { COMPETIDOR_SLUGS } from '@/lib/survey-config/constants';
import {
  getSectionModules,
  locateQuestion,
  surveySections,
} from '@/lib/survey-config';
import { COMPETIDOR_QUESTION_ID, interpolate } from '@/lib/format';
import { getListingFactsFromAnswers } from '@/lib/survey-config/listing-url';
import { AnswerValue, EvidenceFile, EvidenceValidation, ProductListingFacts, Question } from '@/lib/types';

const MARKETPLACE_SET = new Set<string>(COMPETIDOR_SLUGS);
const COUNTRY_SET = new Set(['1', '2']);

/** Contexto extra que viaja al BFF / Lightsail para Vision. */
export interface EvidenceVisionContext {
  marketplace?: string;
  country?: string;
  questionCode?: string;
  studyStage?: string;
  questionText?: string;
  hint?: string;
  /** Valor de A19 (método de entrega seleccionado) */
  selectedShippingMethod?: string;
  /** Label legible de A19 */
  selectedShippingLabel?: string;
  /** A04 título publicación (contexto extracción A17) */
  listingTitle?: string;
  listingSlug?: string;
  expectedPrice?: number;
  expectedCurrency?: string;
}

/** Slug de A07 si es Amazon / Falabella / Temu. */
export function normalizeMarketplace(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const slug = value.trim().toLowerCase();
  return MARKETPLACE_SET.has(slug) ? slug : undefined;
}

/** Código de f1-pais: 1 = Chile, 2 = Colombia. */
export function normalizeCountry(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const code = String(value).trim();
  return COUNTRY_SET.has(code) ? code : undefined;
}

/** Título del módulo (o de la sección) donde está la pregunta. */
function studyStageForQuestion(
  questionId: string,
  answers: Record<string, AnswerValue>
): string | undefined {
  const loc = locateQuestion(questionId, answers);
  if (!loc) return undefined;
  const section = surveySections[loc.sectionIndex];
  if (!section) return undefined;
  const modules = getSectionModules(section, answers);
  const mod = modules[loc.moduleIndex];
  return mod?.title || section.title;
}

const SHIPPING_METHOD_LABELS: Record<string, string> = {
  '1': 'Envío Rápido con costo de envío (pago)',
  '2': 'Envío Rápido sin costo de envío (gratis)',
};

/**
 * Arma el contexto de Vision desde las respuestas (A07, país, A19, enunciado).
 */
export function buildEvidenceVisionContext(
  question: Question,
  answers: Record<string, AnswerValue>
): EvidenceVisionContext {
  const methodRaw = answers['q18c-metodo-entrega'];
  const selectedShippingMethod =
    typeof methodRaw === 'string' && methodRaw ? methodRaw : undefined;
  const listing = getListingFactsFromAnswers(answers);
  const listingTitle =
    typeof answers['q04-titulo-publicacion'] === 'string'
      ? answers['q04-titulo-publicacion']
      : undefined;
  const moneda = answers['q12-1-moneda'];
  const priceRaw =
    moneda === '3' ? answers['q12b-precio-a11b'] : answers['q12-precio'];
  const expectedPrice =
    typeof priceRaw === 'number'
      ? priceRaw
      : typeof priceRaw === 'string'
        ? Number(priceRaw)
        : undefined;

  return {
    marketplace: normalizeMarketplace(answers[COMPETIDOR_QUESTION_ID]),
    country: normalizeCountry(answers['f1-pais']),
    questionCode: question.codigoOriginal,
    studyStage: studyStageForQuestion(question.id, answers),
    questionText: interpolate(question.text, answers),
    hint: question.hint ? interpolate(question.hint, answers) : undefined,
    selectedShippingMethod,
    selectedShippingLabel: selectedShippingMethod
      ? SHIPPING_METHOD_LABELS[selectedShippingMethod]
      : undefined,
    listingTitle,
    listingSlug: listing?.slug,
    expectedPrice: Number.isFinite(expectedPrice) ? expectedPrice : undefined,
    expectedCurrency:
      moneda === '1' ? 'CLP' : moneda === '2' ? 'COP' : moneda === '3' ? 'USD' : undefined,
  };
}

/** Llama al BFF de validación Vision; fail-soft si falla la red. */
export async function validateEvidenceFile(
  file: EvidenceFile,
  question: Question,
  context?: EvidenceVisionContext
): Promise<EvidenceValidation> {
  try {
    const res = await fetch('/api/evidencia/validar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: file.url,
        questionId: question.id,
        questionText: context?.questionText ?? question.text,
        hint: context?.hint ?? question.hint,
        marketplace: context?.marketplace,
        country: context?.country,
        questionCode: context?.questionCode ?? question.codigoOriginal,
        studyStage: context?.studyStage,
        selectedShippingMethod: context?.selectedShippingMethod,
        selectedShippingLabel: context?.selectedShippingLabel,
        listingTitle: context?.listingTitle,
        listingSlug: context?.listingSlug,
        expectedPrice: context?.expectedPrice,
        expectedCurrency: context?.expectedCurrency,
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
    const facts = parseProductListingFacts(data.facts);
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
      facts,
    };
  } catch {
    return {
      status: 'doubt',
      confidence: 0,
      reason: 'validation_unavailable',
    };
  }
}

function parseProductListingFacts(raw: unknown): ProductListingFacts | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const facts: ProductListingFacts = {};
  if (typeof o.title === 'string' && o.title.trim()) facts.title = o.title.trim();
  if (typeof o.price === 'number' && Number.isFinite(o.price)) facts.price = o.price;
  if (typeof o.currency === 'string' && o.currency.trim()) {
    facts.currency = o.currency.trim();
  }
  if (typeof o.soldBy === 'string' && o.soldBy.trim()) facts.soldBy = o.soldBy.trim();
  if (typeof o.shippedBy === 'string' && o.shippedBy.trim()) {
    facts.shippedBy = o.shippedBy.trim();
  }
  if (typeof o.marketplaceVisible === 'string' && o.marketplaceVisible.trim()) {
    facts.marketplaceVisible = o.marketplaceVisible.trim();
  }
  return Object.keys(facts).length > 0 ? facts : undefined;
}
