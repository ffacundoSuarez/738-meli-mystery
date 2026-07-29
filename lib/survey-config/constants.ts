import { ConditionClause, QuestionOption, SurveyModule } from '../types';

// ============================================================
// PLACEHOLDER — Etapa 1
//
// Catálogos y condiciones del cuestionario Mercado Libre.
// El contenido de acá es provisorio: sirve para poder probar el flujo
// completo (crear postulante → responder → revisar → aprobar) antes de
// tener el cuestionario real.
//
// ⚠️ Al cargar el cuestionario definitivo, revisar en paralelo:
//   - meli_summary_answers() en supabase/migrations/0001_meli_schema.sql
//     (allowlist de claves de screening; si no coincide, los gráficos del
//     dashboard salen vacíos sin lanzar error)
//   - lib/survey-snapshot.ts (lee estas mismas claves)
//
// 'f1-pais' es una clave acoplada al SQL: meli_admin_create_postulante la
// precarga en answers al crear el postulante. Si cambia el id, hay que
// cambiarlo en los dos lados a la vez.
// ============================================================

/**
 * Crea el módulo de evidencias que se muestra al final de cada parte.
 * Permite adjuntar cualquier archivo (audios, imágenes, videos, PDF, etc.).
 * Es opcional: no bloquea el envío de la parte a revisión.
 * @param parte Número de parte (1, 2 o 3) para generar IDs únicos.
 */
export function evidenciasModule(parte: number): SurveyModule {
  return {
    id: `evidencias-p${parte}`,
    title: 'Evidencias',
    titlePt: 'Evidências',
    description:
      'Adjunte aquí las evidencias de esta parte. Puede subir audios, imágenes, videos, PDF, capturas de pantalla, etc. (opcional).',
    descriptionPt:
      'Anexe aqui as evidências desta parte. Pode enviar áudios, imagens, vídeos, PDF, capturas de ecrã, etc. (opcional).',
    questions: [
      {
        id: `evidencia-parte-${parte}`,
        text: 'Adjuntar evidencias',
        textPt: 'Anexar evidências',
        type: 'evidence',
        hint: 'Audios, imágenes, videos, PDF y cualquier otro archivo.',
        hintPt: 'Áudios, imagens, vídeos, PDF e qualquer outro ficheiro.',
      },
    ],
  };
}

export const SI_NO: QuestionOption[] = [
  { value: 'si', label: 'Sí', labelPt: 'Sim' },
  { value: 'no', label: 'No', labelPt: 'Não' },
];

export const SI_NO_COD: QuestionOption[] = [
  { value: '1', label: 'Sí', labelPt: 'Sim' },
  { value: '2', label: 'No', labelPt: 'Não' },
];

/** Columnas Sí/No para preguntas de tipo matriz */
export const SI_NO_MATRIX: QuestionOption[] = SI_NO_COD;

/** Países donde opera Mercado Libre */
export const PAISES: QuestionOption[] = [
  { value: '1', label: 'Argentina', labelPt: 'Argentina' },
  { value: '2', label: 'Brasil', labelPt: 'Brasil' },
  { value: '3', label: 'México', labelPt: 'México' },
  { value: '4', label: 'Chile', labelPt: 'Chile' },
  { value: '5', label: 'Colombia', labelPt: 'Colômbia' },
  { value: '6', label: 'Perú', labelPt: 'Peru' },
  { value: '7', label: 'Uruguay', labelPt: 'Uruguai' },
];

/** Condición: país = código(s). El id 'f1-pais' está acoplado al SQL. */
export function pais(...codes: string[]): ConditionClause {
  return { questionId: 'f1-pais', values: codes };
}

function region(
  value: string,
  label: string,
  ...paisCodes: string[]
): QuestionOption {
  return { value, label, labelPt: label, showIf: pais(...paisCodes) };
}

/**
 * Opciones de la única pregunta de región ('f2-region').
 * A diferencia de Prosegur (que usaba una pregunta por país, f2a…f2h), acá
 * hay una sola pregunta y cada opción se filtra por país con showIf.
 */
export const REGIONES: QuestionOption[] = [
  region('amba', 'AMBA (Gran Buenos Aires y CABA)', '1'),
  region('cordoba', 'Córdoba', '1'),
  region('rosario', 'Rosario', '1'),
  region('sao-paulo', 'São Paulo', '2'),
  region('rio', 'Rio de Janeiro', '2'),
  region('belo-horizonte', 'Belo Horizonte', '2'),
  region('cdmx', 'Ciudad de México', '3'),
  region('guadalajara', 'Guadalajara', '3'),
  region('monterrey', 'Monterrey', '3'),
  region('santiago', 'Santiago', '4'),
  region('bogota', 'Bogotá', '5'),
  region('medellin', 'Medellín', '5'),
  region('lima', 'Lima', '6'),
  region('montevideo', 'Montevideo', '7'),
  { value: 'otro', label: 'Otro', labelPt: 'Outro' },
];

/** Unidades de negocio del ecosistema Mercado Libre */
export const MARCAS: QuestionOption[] = [
  { value: '1', label: 'Mercado Libre', labelPt: 'Mercado Livre' },
  { value: '2', label: 'Mercado Pago', labelPt: 'Mercado Pago' },
  { value: '3', label: 'Mercado Envíos', labelPt: 'Mercado Envios' },
  { value: '4', label: 'Mercado Shops', labelPt: 'Mercado Shops' },
  { value: '5', label: 'Mercado Crédito', labelPt: 'Mercado Crédito' },
  { value: '99', label: 'Otra (especificar)', labelPt: 'Outra (especificar)' },
];

/** Código de MARCAS que habilita el campo de texto libre 'f3-marca-otra' */
export const MARCA_OTRA_CODE = '99';

export const CATEGORIAS: QuestionOption[] = [
  { value: '1', label: 'Comprador', labelPt: 'Comprador' },
  { value: '2', label: 'Vendedor', labelPt: 'Vendedor' },
];

export const CANALES: QuestionOption[] = [
  { value: '1', label: 'App móvil', labelPt: 'App móvel' },
  { value: '2', label: 'Web', labelPt: 'Web' },
];

export const ESCALA_5: QuestionOption[] = [
  { value: '5', label: 'Excelente / Totalmente', labelPt: 'Excelente / Totalmente' },
  { value: '4', label: 'Bueno / Bastante', labelPt: 'Bom / Bastante' },
  { value: '3', label: 'Regular / Parcialmente', labelPt: 'Regular / Parcialmente' },
  { value: '2', label: 'Malo / Muy poco', labelPt: 'Mau / Muito pouco' },
  { value: '1', label: 'Muy malo / Nada', labelPt: 'Muito mau / Nada' },
];

export const ESCALA_SATISFACCION: QuestionOption[] = [
  { value: '5', label: 'Totalmente satisfecho', labelPt: 'Totalmente satisfeito' },
  { value: '4', label: 'Algo satisfecho', labelPt: 'Algo satisfeito' },
  { value: '3', label: 'Ni satisfecho ni insatisfecho', labelPt: 'Nem satisfeito nem insatisfeito' },
  { value: '2', label: 'Insatisfecho', labelPt: 'Insatisfeito' },
  { value: '1', label: 'Muy insatisfecho', labelPt: 'Muito insatisfeito' },
];

// --- Condiciones reutilizables --------------------------------------------

export const SI_MARCA_OTRA: ConditionClause = {
  questionId: 'f3-marca',
  values: [MARCA_OTRA_CODE],
};
export const SI_CAT_COMPRADOR: ConditionClause = { questionId: 'f4-categoria', values: ['1'] };
export const SI_CAT_VENDEDOR: ConditionClause = { questionId: 'f4-categoria', values: ['2'] };
export const SI_CANAL_APP: ConditionClause = { questionId: 'f5-canal', values: ['1'] };
export const SI_CANAL_WEB: ConditionClause = { questionId: 'f5-canal', values: ['2'] };
