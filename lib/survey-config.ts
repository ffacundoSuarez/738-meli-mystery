import { SurveyModule, SurveySection } from './types';
import { getVisibleModules } from './survey-logic';
import { parte1 } from './survey-config/parte-1';
import { parte2 } from './survey-config/parte-2';
import { parte3 } from './survey-config/parte-3';

/** Secciones del cuestionario en orden de navegación */
export const surveySections: SurveySection[] = [parte1, parte2, parte3];

export const REVIEWABLE_SECTIONS = surveySections.map((s) => s.id);

export const HEADER_FIELDS = {
  'nombre-apellido': 'nombreApellido',
  empresa: 'empresa',
  ciudad: 'ciudad',
  'fecha-inicio': 'fechaInicio',
  'fecha-fin': 'fechaFin',
  'ultima-etapa': 'ultimaEtapa',
} as const;

/** Convierte sección plana en un módulo implícito */
export function getSectionModules(
  section: SurveySection,
  answers: Record<string, import('./types').AnswerValue> = {}
): SurveyModule[] {
  if (section.modules) {
    return getVisibleModules(section, answers);
  }
  if (section.questions) {
    return [
      {
        id: section.id,
        title: section.title,
        description: section.description,
        questions: section.questions,
      },
    ];
  }
  return [];
}

/** Todos los módulos visibles de una sección (sin filtrar) */
export function getAllSectionModules(section: SurveySection): SurveyModule[] {
  if (section.modules) return section.modules;
  if (section.questions) {
    return [
      {
        id: section.id,
        title: section.title,
        description: section.description,
        questions: section.questions,
      },
    ];
  }
  return [];
}

export function getSectionTitle(sectionId: string): string {
  return surveySections.find((s) => s.id === sectionId)?.title ?? sectionId;
}

/** Título de sección según idioma */
export function getLocalizedSectionTitle(sectionId: string, lang: import('./types').Lang): string {
  const section = surveySections.find((s) => s.id === sectionId);
  if (!section) return sectionId;
  return lang === 'pt' && section.titlePt ? section.titlePt : section.title;
}

export function getModuleTitle(sectionId: string, moduleId: string): string {
  const section = surveySections.find((s) => s.id === sectionId);
  const mod = section ? getAllSectionModules(section).find((m) => m.id === moduleId) : undefined;
  return mod?.title ?? moduleId;
}

export function getSectionIndex(sectionId: string): number {
  return surveySections.findIndex((s) => s.id === sectionId);
}

export function isReviewableSection(sectionId: string): boolean {
  return REVIEWABLE_SECTIONS.includes(sectionId);
}

export function getNextReviewableSection(currentSectionId: string): string | null {
  const idx = surveySections.findIndex((s) => s.id === currentSectionId);
  for (let i = idx + 1; i < surveySections.length; i++) {
    if (REVIEWABLE_SECTIONS.includes(surveySections[i].id)) {
      return surveySections[i].id;
    }
  }
  return null;
}

export function getResumeSectionIndex(stages: Record<string, { status?: string }>): number {
  let maxIdx = 0;
  for (const sectionId of REVIEWABLE_SECTIONS) {
    const st = stages[sectionId]?.status;
    if (st && st !== 'pendiente') {
      const idx = getSectionIndex(sectionId);
      if (idx > maxIdx) maxIdx = idx;
    }
  }
  return maxIdx;
}

export function getMaxApprovedStage(stages: Record<string, { status?: string }>): string | null {
  let maxIdx = -1;
  let maxStage: string | null = null;
  for (const sectionId of REVIEWABLE_SECTIONS) {
    if (stages[sectionId]?.status === 'aprobada') {
      const idx = REVIEWABLE_SECTIONS.indexOf(sectionId);
      if (idx > maxIdx) {
        maxIdx = idx;
        maxStage = sectionId;
      }
    }
  }
  return maxStage;
}

/** ¿Las 3 partes revisables están aprobadas? */
export function allStagesApproved(stages: Record<string, { status?: string }> = {}): boolean {
  return REVIEWABLE_SECTIONS.every((sectionId) => stages[sectionId]?.status === 'aprobada');
}

/** Índice del siguiente módulo visible dentro de una sección, o -1 si no hay */
export function getNextVisibleModuleIndex(
  section: SurveySection,
  currentModuleIndex: number,
  answers: Record<string, import('./types').AnswerValue>
): number {
  const modules = getSectionModules(section, answers);
  const allModules = getAllSectionModules(section);
  const currentModule = allModules[currentModuleIndex];
  if (!currentModule) return -1;
  const visibleIdx = modules.findIndex((m) => m.id === currentModule.id);
  if (visibleIdx < 0 || visibleIdx >= modules.length - 1) return -1;
  const nextVisible = modules[visibleIdx + 1];
  return allModules.findIndex((m) => m.id === nextVisible.id);
}

/** ¿Es el último módulo visible de la sección? (índice sobre módulos visibles) */
export function isLastVisibleModule(
  section: SurveySection,
  visibleModuleIndex: number,
  answers: Record<string, import('./types').AnswerValue>
): boolean {
  const modules = getSectionModules(section, answers);
  if (modules.length === 0) return true;
  return visibleModuleIndex >= modules.length - 1;
}

/** Ubica una pregunta en el cuestionario (sección + módulo visibles) */
export function locateQuestion(
  questionId: string,
  answers: Record<string, import('./types').AnswerValue> = {}
): { sectionIndex: number; moduleIndex: number } | null {
  for (let si = 0; si < surveySections.length; si++) {
    const section = surveySections[si];
    const modules = getSectionModules(section, answers);
    for (let mi = 0; mi < modules.length; mi++) {
      if (modules[mi].questions.some((q) => q.id === questionId)) {
        return { sectionIndex: si, moduleIndex: mi };
      }
    }
  }
  return null;
}

/** Lista ordenada de IDs de preguntas marcadas a revisar (excluye ya corregidas) */
export function getOrderedReviewQuestionIds(
  reviewFlags: Record<string, { note: string; sectionId: string; corrected?: boolean }> = {}
): string[] {
  const flagged = new Set(
    Object.entries(reviewFlags)
      .filter(([, flag]) => flag.corrected !== true)
      .map(([id]) => id)
  );
  const ordered: string[] = [];
  for (const section of surveySections) {
    const modules = getAllSectionModules(section);
    for (const mod of modules) {
      for (const q of mod.questions) {
        if (flagged.has(q.id)) ordered.push(q.id);
      }
    }
  }
  return ordered;
}
