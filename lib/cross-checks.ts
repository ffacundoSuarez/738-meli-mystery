import { stripAccents } from './survey-config/assignment-title';
import {
  crossCheckPurchaseCodeWithUrl,
  getListingFactsFromAnswers,
  slugLooksLikeTitle,
} from './survey-config/listing-url';
import {
  AnswerValue,
  CrossCheckResult,
  CrossChecksMap,
  EvidenceFile,
  ProductListingFacts,
} from './types';

const PRICE_TOLERANCE_PCT = 0.05;

/** Normaliza texto para comparación fuzzy. */
function normText(raw: string | undefined | null): string {
  if (!raw || typeof raw !== 'string') return '';
  return stripAccents(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Tokens significativos (≥3 chars). */
function tokens(text: string): string[] {
  return normText(text)
    .split(' ')
    .filter((t) => t.length >= 3);
}

/**
 * ¿Dos textos comparten suficientes tokens?
 * null = no hay datos para comparar.
 */
export function textsLookSimilar(
  a: string | undefined | null,
  b: string | undefined | null
): boolean | null {
  const ta = tokens(a || '');
  const tb = new Set(tokens(b || ''));
  if (ta.length === 0 || tb.size === 0) return null;
  const hits = ta.filter((t) => tb.has(t)).length;
  return hits >= Math.min(2, ta.length);
}

function isEvidence(value: AnswerValue | undefined): value is EvidenceFile[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === 'object' &&
    value[0] !== null &&
    'url' in (value[0] as EvidenceFile)
  );
}

/** Primer archivo A17 con facts de Vision. */
export function getProductListingFactsFromAnswers(
  answers: Record<string, AnswerValue | undefined>
): ProductListingFacts | null {
  const files = answers['q17-imagen-producto'];
  if (!isEvidence(files)) return null;
  for (const f of files) {
    if (f.validation?.facts && typeof f.validation.facts === 'object') {
      return f.validation.facts;
    }
  }
  return null;
}

/** Label legible de A13 (vendido por). */
function soldByAnswerLabel(
  answers: Record<string, AnswerValue | undefined>
): string | undefined {
  const code = answers['q14-vendido-por'];
  if (typeof code !== 'string' || !code) return undefined;
  if (code === 'otro') {
    const other = answers['q14-vendido-por-otro'];
    return typeof other === 'string' && other.trim() ? other.trim() : undefined;
  }
  const map: Record<string, string> = {
    falabella: 'Falabella',
    amazon: 'Amazon',
    temu: 'Temu',
  };
  return map[code] || code;
}

function parseAnswerPrice(
  answers: Record<string, AnswerValue | undefined>
): number | undefined {
  const moneda = answers['q12-1-moneda'];
  const raw =
    moneda === '3'
      ? answers['q12b-precio-a11b']
      : answers['q12-precio'];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw.replace(/[^\d.,]/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Mapea moneda A11.1 → código ISO aproximado para cruce con Vision. */
function currencyFromAnswer(
  answers: Record<string, AnswerValue | undefined>
): string | undefined {
  const code = answers['q12-1-moneda'];
  if (code === '1') return 'CLP';
  if (code === '2') return 'COP';
  if (code === '3') return 'USD';
  return undefined;
}

function marketplacesMatch(a: string | undefined, b: string | undefined): boolean | null {
  const na = normText(a);
  const nb = normText(b);
  if (!na || !nb) return null;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

function priceMatch(
  answerPrice: number | undefined,
  visionPrice: number | undefined,
  answerCurrency?: string,
  visionCurrency?: string
): boolean | null {
  if (answerPrice === undefined || visionPrice === undefined) return null;
  if (
    answerCurrency &&
    visionCurrency &&
    normText(answerCurrency) !== normText(visionCurrency)
  ) {
    return null;
  }
  const diff = Math.abs(answerPrice - visionPrice);
  const tol = Math.max(1, answerPrice * PRICE_TOLERANCE_PCT);
  return diff <= tol;
}

function addCheck(
  out: CrossChecksMap,
  key: string,
  result: CrossCheckResult
): void {
  if (result.status === 'skip') return;
  out[key] = result;
}

/**
 * Calcula cruces URL + Vision vs respuestas del mystery.
 * Solo badges en revisión; no bloquea avance.
 */
export function computeCrossChecks(
  answers: Record<string, AnswerValue | undefined>
): CrossChecksMap {
  const out: CrossChecksMap = {};
  const listing = getListingFactsFromAnswers(answers);
  const vision = getProductListingFactsFromAnswers(answers);
  const title =
    typeof answers['q04-titulo-publicacion'] === 'string'
      ? answers['q04-titulo-publicacion']
      : undefined;
  const marketplace =
    typeof answers['q8-competidor'] === 'string'
      ? answers['q8-competidor']
      : undefined;

  const slugOk = slugLooksLikeTitle(listing?.slug, title);
  if (slugOk === true) {
    addCheck(out, 'a04-title-vs-url-slug', {
      status: 'match',
      label: 'Título ≈ slug URL',
    });
  } else if (slugOk === false) {
    addCheck(out, 'a04-title-vs-url-slug', {
      status: 'mismatch',
      label: 'Título ≠ slug URL',
      detail: listing?.slug,
    });
  }

  const titleVision = textsLookSimilar(title, vision?.title);
  if (titleVision === true) {
    addCheck(out, 'a04-title-vs-a17', {
      status: 'match',
      label: 'Título ≈ foto A17',
    });
  } else if (titleVision === false) {
    addCheck(out, 'a04-title-vs-a17', {
      status: 'mismatch',
      label: 'Título ≠ foto A17',
      detail: vision?.title,
    });
  }

  const mpUrl = marketplacesMatch(marketplace, listing?.marketplace);
  if (mpUrl === true) {
    addCheck(out, 'a07-marketplace-vs-url', {
      status: 'match',
      label: 'Marketplace ≈ URL',
    });
  } else if (mpUrl === false) {
    addCheck(out, 'a07-marketplace-vs-url', {
      status: 'mismatch',
      label: 'Marketplace ≠ URL',
      detail: listing?.marketplace,
    });
  }

  const mpVision = marketplacesMatch(
    marketplace,
    vision?.marketplaceVisible || vision?.soldBy
  );
  if (mpVision === true) {
    addCheck(out, 'a07-marketplace-vs-a17', {
      status: 'match',
      label: 'Marketplace ≈ foto A17',
    });
  } else if (mpVision === false) {
    addCheck(out, 'a07-marketplace-vs-a17', {
      status: 'mismatch',
      label: 'Marketplace ≠ foto A17',
      detail: vision?.marketplaceVisible || vision?.soldBy,
    });
  }

  const answerPrice = parseAnswerPrice(answers);
  const answerCurrency = currencyFromAnswer(answers);
  const priceOk = priceMatch(
    answerPrice,
    vision?.price,
    answerCurrency,
    vision?.currency
  );
  if (priceOk === true) {
    addCheck(out, 'a11-price-vs-a17', {
      status: 'match',
      label: 'Precio ≈ foto A17',
    });
  } else if (priceOk === false) {
    addCheck(out, 'a11-price-vs-a17', {
      status: 'mismatch',
      label: 'Precio ≠ foto A17',
      detail:
        vision?.price !== undefined
          ? `${vision.price}${vision.currency ? ` ${vision.currency}` : ''}`
          : undefined,
    });
  }

  const soldByAnswer = soldByAnswerLabel(answers);
  const soldVision = textsLookSimilar(soldByAnswer, vision?.soldBy);
  if (soldVision === true) {
    addCheck(out, 'a13-soldby-vs-a17', {
      status: 'match',
      label: 'Vendido por ≈ foto A17',
    });
  } else if (soldVision === false) {
    addCheck(out, 'a13-soldby-vs-a17', {
      status: 'mismatch',
      label: 'Vendido por ≠ foto A17',
      detail: vision?.soldBy,
    });
  }

  const codeCross = crossCheckPurchaseCodeWithUrl(
    answers['q06-codigo-compra'],
    answers['q05-link-publicacion']
  );
  if (codeCross.status === 'match') {
    addCheck(out, 'a06-code-vs-url', {
      status: 'match',
      label: codeCross.label,
    });
  } else if (codeCross.status === 'mismatch') {
    addCheck(out, 'a06-code-vs-url', {
      status: 'mismatch',
      label: codeCross.label,
    });
  } else if (codeCross.status === 'no_id_in_url') {
    addCheck(out, 'a06-code-vs-url', {
      status: 'doubt',
      label: codeCross.label,
    });
  }

  return out;
}

/** Cruces relevantes para una pregunta en revisión. */
export function crossChecksForQuestion(
  questionId: string,
  checks: CrossChecksMap | null | undefined
): CrossCheckResult[] {
  if (!checks) return [];
  const map: Record<string, string[]> = {
    'q04-titulo-publicacion': ['a04-title-vs-url-slug', 'a04-title-vs-a17'],
    'q05-link-publicacion': ['a07-marketplace-vs-url'],
    'q06-codigo-compra': ['a06-code-vs-url'],
    'q8-competidor': ['a07-marketplace-vs-url', 'a07-marketplace-vs-a17'],
    'q12-precio': ['a11-price-vs-a17'],
    'q14-vendido-por': ['a13-soldby-vs-a17'],
    'q17-imagen-producto': ['a04-title-vs-a17', 'a11-price-vs-a17', 'a13-soldby-vs-a17'],
  };
  const keys = map[questionId] || [];
  return keys.map((k) => checks[k]).filter(Boolean) as CrossCheckResult[];
}

export const CROSS_CHECK_BADGE_COLORS: Record<
  CrossCheckResult['status'],
  string
> = {
  match: 'bg-green-50 text-green-800 border-green-200',
  mismatch: 'bg-red-50 text-red-800 border-red-200',
  doubt: 'bg-amber-50 text-amber-800 border-amber-200',
  skip: 'bg-slate-50 text-slate-600 border-slate-200',
};
