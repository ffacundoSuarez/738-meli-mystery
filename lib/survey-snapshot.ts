import {
  CANALES,
  CATEGORIAS,
  MARCAS,
  MARCA_OTRA_CODE,
  PAISES,
  REGIONES,
} from './survey-config/constants';
import { getSectionTitle, allStagesApproved, REVIEWABLE_SECTIONS } from './survey-config';
import { AnswerValue, QuestionOption, StageStatus, StagesMap } from './types';

// ⚠️ Este archivo lee las claves de screening del cuestionario.
// Debe mantenerse en sintonía con lib/survey-config/constants.ts y con la
// allowlist de meli_summary_answers() en supabase/migrations/0001_meli_schema.sql.

const STAGE_SHORT: Record<StageStatus, string> = {
  pendiente: 'Pendiente',
  en_revision: 'En revisión',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
};

export interface ScreeningSnapshot {
  paisCode?: string;
  pais?: string;
  region?: string;
  marca?: string;
  categoria?: string;
  canal?: string;
  hasScreening: boolean;
}

function optionLabel(options: QuestionOption[], value: string): string | undefined {
  return options.find((o) => o.value === value)?.label;
}

/** Resumen legible del módulo screening (F1–F5) desde answers */
export function getScreeningSnapshot(
  answers: Record<string, AnswerValue> = {}
): ScreeningSnapshot {
  const paisCode = answers['f1-pais'] as string | undefined;
  const pais = paisCode ? optionLabel(PAISES, paisCode) : undefined;

  const regionCode = answers['f2-region'] as string | undefined;
  const region = regionCode
    ? optionLabel(REGIONES, regionCode) ?? regionCode
    : undefined;

  const marcaCode = answers['f3-marca'] as string | undefined;
  let marca: string | undefined;
  if (marcaCode === MARCA_OTRA_CODE) {
    marca = (answers['f3-marca-otra'] as string) || 'Otra';
  } else if (marcaCode) {
    marca = optionLabel(MARCAS, marcaCode);
  }

  const categoriaCode = answers['f4-categoria'] as string | undefined;
  const categoria = categoriaCode ? optionLabel(CATEGORIAS, categoriaCode) : undefined;

  const canalCode = answers['f5-canal'] as string | undefined;
  const canal = canalCode ? optionLabel(CANALES, canalCode) : undefined;

  return {
    paisCode,
    pais,
    region,
    marca,
    categoria,
    canal,
    hasScreening: Boolean(paisCode),
  };
}

/**
 * True si la encuesta fue contestada en la primera etapa:
 * la primera parte revisable fue enviada (status distinto de pendiente).
 * Se usa para que las estadísticas no cuenten links generados sin responder.
 */
export function hasAnsweredFirstStage(stages: StagesMap = {}): boolean {
  const first = REVIEWABLE_SECTIONS[0];
  if (!first) return false;
  const status = stages[first]?.status;
  return Boolean(status && status !== 'pendiente');
}

/** Texto corto de progreso por partes */
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
