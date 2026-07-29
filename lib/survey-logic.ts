import {
  AnswerValue,
  Condition,
  ConditionClause,
  MatrixRow,
  Question,
  QuestionOption,
  SurveyModule,
  SurveySection,
} from './types';

/** ¿El valor es una respuesta de matriz? */
export function isMatrixAnswer(value: AnswerValue): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !('url' in value)
  );
}

/** Evalúa una cláusula contra las respuestas actuales */
function evaluateClause(
  clause: ConditionClause,
  answers: Record<string, AnswerValue>
): boolean {
  const dependent = answers[clause.questionId];
  const operator = clause.operator ?? 'in';
  const values = clause.values;

  if (dependent === undefined || dependent === null || dependent === '') {
    return operator === 'notIn';
  }

  const matchValue = (v: string) => values.includes(v);

  if (Array.isArray(dependent) && !isMatrixAnswer(dependent)) {
    const arr = dependent as string[];
    switch (operator) {
      case 'eq':
        return arr.length === 1 && matchValue(arr[0]);
      case 'neq':
        return arr.length === 0 || !arr.some(matchValue);
      case 'in':
        return arr.some(matchValue);
      case 'notIn':
        return !arr.some(matchValue);
    }
  }

  const str = String(dependent);
  switch (operator) {
    case 'eq':
    case 'in':
      return matchValue(str);
    case 'neq':
    case 'notIn':
      return !matchValue(str);
    default:
      return false;
  }
}

/** Evalúa una condición (legacy, AND u OR) */
export function evaluateCondition(
  condition: Condition | undefined,
  answers: Record<string, AnswerValue>
): boolean {
  if (!condition) return true;

  if ('all' in condition) {
    return condition.all.every((c) => evaluateClause(c, answers));
  }

  if ('any' in condition) {
    return condition.any.some((c) => evaluateClause(c, answers));
  }

  if ('questionId' in condition) {
    return evaluateClause(condition, answers);
  }

  return true;
}

export function isQuestionVisible(
  question: Question,
  answers: Record<string, AnswerValue>
): boolean {
  return evaluateCondition(question.showIf, answers);
}

export function isModuleVisible(
  module: SurveyModule,
  answers: Record<string, AnswerValue>
): boolean {
  return evaluateCondition(module.showIf, answers);
}

/** Opciones visibles según showIf de cada opción */
export function getVisibleOptions(
  question: Question,
  answers: Record<string, AnswerValue>
): QuestionOption[] {
  return (question.options ?? []).filter((o) =>
    evaluateCondition(o.showIf, answers)
  );
}

/** Filas visibles de una matriz */
export function getVisibleMatrixRows(
  question: Question,
  answers: Record<string, AnswerValue>
): MatrixRow[] {
  return (question.matrixRows ?? []).filter((r) =>
    evaluateCondition(r.showIf, answers)
  );
}

/** Hash simple para semilla determinística */
function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Baraja opciones de forma determinística (estable por shopper) */
export function getOrderedOptions(
  question: Question,
  answers: Record<string, AnswerValue>,
  seed: string,
  rotate = true
): QuestionOption[] {
  const options = getVisibleOptions(question, answers);
  if (!rotate || !question.rotate || options.length <= 1) return options;

  const shuffled = [...options];
  let state = hashSeed(`${seed}:${question.id}`);
  for (let i = shuffled.length - 1; i > 0; i--) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    const j = state % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** Busca descalificación por terminateIf en preguntas visibles */
export function getDisqualification(
  sections: SurveySection[],
  answers: Record<string, AnswerValue>
): { terminated: boolean; reason?: string; questionId?: string } {
  for (const section of sections) {
    const questions = getAllQuestionsFromSection(section);
    for (const q of questions) {
      if (!isQuestionVisible(q, answers)) continue;
      if (q.terminateIf && evaluateCondition(q.terminateIf, answers)) {
        return { terminated: true, reason: q.text, questionId: q.id };
      }
      // También: opción seleccionada con terminateIf implícito vía valor "otro" en regiones
    }
  }
  return { terminated: false };
}

/** Todas las preguntas de una sección (plana o por módulos) */
export function getAllQuestionsFromSection(section: SurveySection): Question[] {
  if (section.questions) return section.questions;
  return (section.modules ?? []).flatMap((m) => m.questions);
}

/** Módulos visibles de una parte */
export function getVisibleModules(
  section: SurveySection,
  answers: Record<string, AnswerValue>
): SurveyModule[] {
  return (section.modules ?? []).filter((m) => isModuleVisible(m, answers));
}

/** Preguntas visibles de un módulo */
export function getVisibleQuestions(
  module: SurveyModule,
  answers: Record<string, AnswerValue>
): Question[] {
  return module.questions.filter((q) => isQuestionVisible(q, answers));
}

/** Aplana todas las preguntas del cuestionario */
export function getAllQuestions(sections: SurveySection[]): Question[] {
  return sections.flatMap(getAllQuestionsFromSection);
}

/** Busca pregunta por id */
export function findQuestionInSections(
  sections: SurveySection[],
  questionId: string
): Question | undefined {
  return getAllQuestions(sections).find((q) => q.id === questionId);
}

/** IDs de respuesta pertenecientes a una sección/parte */
export function getSectionQuestionIds(section: SurveySection): string[] {
  return getAllQuestionsFromSection(section).map((q) => q.id);
}

/** IDs de respuesta de un módulo */
export function getModuleQuestionIds(module: SurveyModule): string[] {
  return module.questions.map((q) => q.id);
}

/** Extrae respuestas de una parte completa */
export function getPartAnswers(
  section: SurveySection,
  answers: Record<string, AnswerValue>
): Record<string, AnswerValue> {
  const result: Record<string, AnswerValue> = {};
  for (const q of getAllQuestionsFromSection(section)) {
    if (answers[q.id] !== undefined) {
      result[q.id] = answers[q.id];
    }
  }
  return result;
}

/** Extrae respuestas de un módulo */
export function getModuleAnswers(
  module: SurveyModule,
  answers: Record<string, AnswerValue>
): Record<string, AnswerValue> {
  const result: Record<string, AnswerValue> = {};
  for (const q of module.questions) {
    if (answers[q.id] !== undefined) {
      result[q.id] = answers[q.id];
    }
  }
  return result;
}

/** ¿La pregunta tiene respuesta con valor? */
export function hasAnswerValue(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isMatrixAnswer(value)) return Object.keys(value).length > 0;
  return true;
}

/** ¿El módulo visible tiene al menos una respuesta? */
export function moduleHasAnswers(
  module: SurveyModule,
  answers: Record<string, AnswerValue>
): boolean {
  return getVisibleQuestions(module, answers).some((q) =>
    hasAnswerValue(answers[q.id])
  );
}

function isEvidenceValue(value: AnswerValue): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === 'object' &&
    value[0] !== null &&
    'url' in value[0]
  );
}

/** ¿La pregunta visible tiene respuesta completa y no vacía? */
export function isQuestionAnswered(
  question: Question,
  answers: Record<string, AnswerValue>
): boolean {
  if (!isQuestionVisible(question, answers)) return true;
  if (question.type === 'info') return true;

  const value = answers[question.id];

  if (question.type === 'matrix') {
    const rows = getVisibleMatrixRows(question, answers);
    if (rows.length === 0) return true;
    const matrixVal = (value as Record<string, string>) || {};
    return rows.every((r) => {
      const cell = matrixVal[r.id];
      return cell !== undefined && cell !== '';
    });
  }

  if (question.type === 'multiple') {
    return Array.isArray(value) && (value as string[]).length > 0;
  }

  if (question.type === 'evidence') {
    // Las evidencias son opcionales salvo que se marquen required:
    // permite avanzar/enviar la parte aunque no se adjunten archivos.
    return question.required ? isEvidenceValue(value) : true;
  }

  if (!hasAnswerValue(value)) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
}

/** Preguntas reveladas progresivamente: cada una aparece al responder la anterior */
export function getProgressiveQuestions(
  module: SurveyModule,
  answers: Record<string, AnswerValue>
): Question[] {
  const result: Question[] = [];
  for (const q of module.questions) {
    if (!isQuestionVisible(q, answers)) continue;
    result.push(q);
    if (!isQuestionAnswered(q, answers)) break;
    if (q.terminateIf && evaluateCondition(q.terminateIf, answers)) break;
  }
  return result;
}

/** ¿Todas las preguntas visibles del módulo están respondidas? */
export function isModuleComplete(
  module: SurveyModule,
  answers: Record<string, AnswerValue>
): boolean {
  const progressive = getProgressiveQuestions(module, answers);
  if (progressive.length === 0) return false;

  const last = progressive[progressive.length - 1];
  if (!isQuestionAnswered(last, answers)) return false;

  if (last.terminateIf && evaluateCondition(last.terminateIf, answers)) {
    return true;
  }

  return getVisibleQuestions(module, answers).every((q) =>
    isQuestionAnswered(q, answers)
  );
}

/** ¿La parte tiene al menos una respuesta en preguntas visibles? */
export function partHasAnswers(
  section: SurveySection,
  answers: Record<string, AnswerValue>
): boolean {
  if (section.modules) {
    return getVisibleModules(section, answers).some((m) =>
      moduleHasAnswers(m, answers)
    );
  }
  return getAllQuestionsFromSection(section)
    .filter((q) => isQuestionVisible(q, answers))
    .some((q) => hasAnswerValue(answers[q.id]));
}
