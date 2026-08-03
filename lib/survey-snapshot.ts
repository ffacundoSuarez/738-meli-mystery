import {
  CATEGORIAS,
  CIUDADES,
  COMPETIDORES,
  PAISES,
  ENTREGA_TIEMPO,
} from './survey-config/constants';
import { getSectionTitle, allStagesApproved, REVIEWABLE_SECTIONS } from './survey-config';
import { AnswerValue, QuestionOption, StageStatus, StagesMap } from './types';

// Claves alineadas con meli_summary_answers() (migración 0002) y constants.ts

const STAGE_SHORT: Record<StageStatus, string> = {
  pendiente: 'Pendiente',
  en_revision: 'En revisión',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
};

export interface ScreeningSnapshot {
  paisCode?: string;
  pais?: string;
  ciudad?: string;
  competidor?: string;
  categoria?: string;
  tipoEntrega?: string;
  /** @deprecated alias de competidor para UI legacy */
  marca?: string;
  /** @deprecated */
  region?: string;
  /** @deprecated */
  canal?: string;
  hasScreening: boolean;
}

function optionLabel(options: QuestionOption[], value: string): string | undefined {
  return options.find((o) => o.value === value)?.label;
}

/** Resumen legible del screening (país, competidor, categoría, ciudad) */
export function getScreeningSnapshot(
  answers: Record<string, AnswerValue> = {}
): ScreeningSnapshot {
  const paisCode = answers['f1-pais'] as string | undefined;
  const pais = paisCode ? optionLabel(PAISES, paisCode) : undefined;

  const ciudadCode = answers['q10-ciudad'] as string | undefined;
  const ciudad = ciudadCode
    ? optionLabel(CIUDADES, ciudadCode) ?? ciudadCode
    : undefined;

  const competidorCode = answers['q8-competidor'] as string | undefined;
  const competidor = competidorCode
    ? optionLabel(COMPETIDORES, competidorCode)
    : undefined;

  const categoriaCode = answers['q11-categoria'] as string | undefined;
  let categoria: string | undefined;
  if (categoriaCode === '97') {
    categoria = (answers['q11-categoria-otra'] as string) || 'Otros (especificar)';
  } else if (categoriaCode) {
    categoria = optionLabel(CATEGORIAS, categoriaCode);
  }

  const tipoCode = answers['q34-entrega-tiempo'] as string | undefined;
  const tipoEntrega = tipoCode
    ? optionLabel(ENTREGA_TIEMPO, tipoCode)
    : undefined;

  return {
    paisCode,
    pais,
    ciudad,
    competidor,
    categoria,
    tipoEntrega,
    marca: competidor,
    region: ciudad,
    canal: tipoEntrega,
    hasScreening: Boolean(paisCode),
  };
}

export function hasAnsweredFirstStage(stages: StagesMap = {}): boolean {
  const first = REVIEWABLE_SECTIONS[0];
  if (!first) return false;
  const status = stages[first]?.status;
  return Boolean(status && status !== 'pendiente');
}

export function getPartProgressLabel(stages: StagesMap = {}): string {
  if (allStagesApproved(stages)) return 'Encuesta completa';

  let lastActive = -1;
  for (let i = 0; i < REVIEWABLE_SECTIONS.length; i++) {
    const status = stages[REVIEWABLE_SECTIONS[i]]?.status;
    if (status && status !== 'pendiente') lastActive = i;
  }

  if (lastActive < 0) return 'Sin iniciar';

  const partId = REVIEWABLE_SECTIONS[lastActive];
  const status = stages[partId]?.status as StageStatus | undefined;
  const title = getSectionTitle(partId).replace(/^Parte /, 'P').replace(/\s*—.*$/, '');
  return status ? `${title} · ${STAGE_SHORT[status]}` : title;
}
