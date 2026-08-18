import { COMPETIDOR_SLUGS } from '@/lib/survey-config/constants';
import {
  getSectionModules,
  locateQuestion,
  surveySections,
} from '@/lib/survey-config';
import { COMPETIDOR_QUESTION_ID, interpolate } from '@/lib/format';
import { AnswerValue, EvidenceFile, EvidenceValidation, Question } from '@/lib/types';

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

/**
 * Arma el contexto de Vision desde las respuestas (A07, país, enunciado interpolado).
 */
export function buildEvidenceVisionContext(
  question: Question,
  answers: Record<string, AnswerValue>
): EvidenceVisionContext {
  return {
    marketplace: normalizeMarketplace(answers[COMPETIDOR_QUESTION_ID]),
    country: normalizeCountry(answers['f1-pais']),
    questionCode: question.codigoOriginal,
    studyStage: studyStageForQuestion(question.id, answers),
    questionText: interpolate(question.text, answers),
    hint: question.hint ? interpolate(question.hint, answers) : undefined,
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
