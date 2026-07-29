// Tipos para el sistema de formularios Mystery Shopper Mercado Libre

export type Lang = 'es' | 'pt';

export type ConditionOperator = 'eq' | 'neq' | 'in' | 'notIn';

/** Una cláusula de condición sobre una respuesta previa */
export interface ConditionClause {
  questionId: string;
  operator?: ConditionOperator;
  values: string[];
}

/**
 * Condición lógica retrocompatible:
 * - Forma legacy: { questionId, values } (equivale a operator 'in')
 * - AND: { all: Clause[] }
 * - OR: { any: Clause[] }
 */
export type Condition =
  | ConditionClause
  | { all: ConditionClause[] }
  | { any: ConditionClause[] };

export interface QuestionOption {
  value: string;
  label: string;
  labelPt?: string;
  showIf?: Condition;
}

/** Fila de una pregunta tipo matriz */
export interface MatrixRow {
  id: string;
  label: string;
  labelPt?: string;
  showIf?: Condition;
}

export interface Question {
  id: string;
  text: string;
  textPt?: string;
  type:
    | 'single'
    | 'multiple'
    | 'text'
    | 'longtext'
    | 'date'
    | 'time'
    | 'datetime'
    | 'number'
    | 'scale'
    | 'evidence'
    | 'matrix'
    | 'info';
  options?: QuestionOption[];
  required?: boolean;
  hint?: string;
  hintPt?: string;
  showIf?: Condition;
  /** Descalifica toda la encuesta si se cumple (ej. región "Otro") */
  terminateIf?: Condition;
  /** Baraja opciones determinísticamente por shopper */
  rotate?: boolean;
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
  scaleMinLabelPt?: string;
  scaleMaxLabelPt?: string;
  matrixRows?: MatrixRow[];
  matrixColumns?: QuestionOption[];
}

/** Módulo visual dentro de una parte (fluye uno tras otro) */
export interface SurveyModule {
  id: string;
  title: string;
  titlePt?: string;
  description?: string;
  descriptionPt?: string;
  showIf?: Condition;
  questions: Question[];
}

/**
 * Parte del cuestionario (= unidad de etapa/revisión).
 * `general` usa questions planas; las partes usan modules.
 */
export interface SurveySection {
  id: string;
  title: string;
  titlePt?: string;
  description?: string;
  descriptionPt?: string;
  /** Sección plana (solo general) */
  questions?: Question[];
  /** Partes con módulos internos */
  modules?: SurveyModule[];
}

export type ResponseStatus = 'borrador' | 'en_revision' | 'publicado' | 'rechazado';
export type StageStatus = 'pendiente' | 'en_revision' | 'aprobada' | 'rechazada';

export interface StageInfo {
  status: StageStatus;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionMessage?: string;
}

export type StagesMap = Record<string, StageInfo>;

/** Nota de revisión por pregunta (activa hasta que el postulante reenvía la parte) */
export interface ReviewFlag {
  note: string;
  sectionId: string;
  /** true cuando el shopper reenvió correcciones de esta pregunta */
  corrected?: boolean;
  correctedAt?: string;
}

export type ReviewFlagsMap = Record<string, ReviewFlag>;

export interface EvidenceFile {
  url: string;
  name: string;
  type: string;
}

/** Respuesta de matriz: filaId -> valor de columna */
export type MatrixAnswer = Record<string, string>;

export type AnswerValue = string | string[] | EvidenceFile[] | MatrixAnswer;

export interface SurveyResponse {
  id: string;
  code?: string;
  accessToken?: string;
  idioma?: Lang;
  isPrueba?: boolean;
  nombre?: string;
  apellido?: string;
  nombreApellido?: string;
  empresa?: string;
  ciudad?: string;
  fechaInicio?: string;
  fechaFin?: string;
  ultimaEtapa?: string;
  status: ResponseStatus;
  stages: StagesMap;
  reviewFlags?: ReviewFlagsMap;
  answers: Record<string, AnswerValue>;
  reviewedAt?: string;
  reviewedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PendingReviewItem {
  id: string;
  code?: string;
  accessToken?: string;
  idioma?: Lang;
  isPrueba?: boolean;
  nombre?: string;
  apellido?: string;
  nombreApellido?: string;
  empresa?: string;
  ciudad?: string;
  sectionId: string;
  stages: StagesMap;
  reviewFlags?: ReviewFlagsMap;
  answers: Record<string, AnswerValue>;
  updatedAt: string;
}

export interface PublicResult {
  id: string;
  code?: string;
  nombre?: string;
  apellido?: string;
  nombreApellido?: string;
  empresa?: string;
  ciudad?: string;
  maxApprovedStage?: string;
  stages: StagesMap;
  answers: Record<string, AnswerValue>;
  updatedAt: string;
}

export interface PostulanteSummary {
  id: string;
  code?: string;
  accessToken?: string;
  idioma?: Lang;
  isPrueba?: boolean;
  nombre?: string;
  apellido?: string;
  nombreApellido?: string;
  empresa?: string;
  ciudad?: string;
  stages?: StagesMap;
  reviewFlags?: ReviewFlagsMap;
  answers?: Record<string, AnswerValue>;
  status?: ResponseStatus;
  createdAt: string;
  updatedAt?: string;
}
