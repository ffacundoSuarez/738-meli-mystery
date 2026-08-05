import { Condition, ConditionClause, QuestionOption, SurveyModule } from '../types';

// ============================================================
// Catálogos y condiciones — Cuestionario Mercado Envíos 03.08 (A–F)
//
// Fidelidad textual: labels literales desde incoming/fiel.txt.
//
// ⚠️ PUNTOS ACOPLADOS AL SQL / DASHBOARD:
//   - 'f1-pais' precargado por meli_admin_create_postulante
//   - Allowlist de screening: migración 0002 (q8-competidor, q10-ciudad,
//     q11-categoria, q34-entrega-tiempo, ola) + lib/survey-snapshot.ts
// ============================================================

// --- Helpers de condiciones -------------------------------------------------

/** Condición: país = código(s). El id 'f1-pais' está acoplado al SQL. */
export function pais(...codes: string[]): ConditionClause {
  return { questionId: 'f1-pais', values: codes };
}

/** Condición de pertenencia: la respuesta de `qid` está en `vals` (default `in`). */
export function eq(qid: string, ...vals: string[]): ConditionClause {
  return { questionId: qid, values: vals };
}

/** Condición de desigualdad. */
export function neq(qid: string, ...vals: string[]): ConditionClause {
  return { questionId: qid, operator: 'neq', values: vals };
}

/**
 * Condición de rango numérico cerrado [min, max] sobre `qid`.
 * Devuelve un AND de gte/lte (útil para escalas 0–10).
 */
export function range(qid: string, min: number, max: number): Condition {
  return {
    all: [
      { questionId: qid, operator: 'gte', values: [String(min)] },
      { questionId: qid, operator: 'lte', values: [String(max)] },
    ],
  };
}

/** Clona opciones agregándoles showIf por país (Chile=1, Colombia=2). */
export function withPais(code: string, options: QuestionOption[]): QuestionOption[] {
  return options.map((o) => ({ ...o, showIf: pais(code) }));
}

/**
 * showIf para opciones de A13 (Vendido por) cuando inventario = 1P:
 * solo el marketplace elegido en A07; si no es 1P, todas visibles.
 */
export function vendidoPorSi1P(slug: string): Condition {
  return {
    any: [neq('q16-inventario', '1p'), eq('q8-competidor', slug)],
  };
}

// --- Sí / No ----------------------------------------------------------------

export const SI_NO_COD: QuestionOption[] = [
  { value: '1', label: 'Sí', labelPt: 'Sim' },
  { value: '2', label: 'No', labelPt: 'Não' },
];

/** Sí / No / No aplica (código 99). */
export const SI_NO_NA: QuestionOption[] = [
  { value: '1', label: 'Sí', labelPt: 'Sim' },
  { value: '2', label: 'No', labelPt: 'Não' },
  { value: '99', label: 'No aplica', labelPt: 'Não se aplica' },
];

// --- País (VARIABLE AUXILIAR: Chile=1, Colombia=2) --------------------------

export const PAISES: QuestionOption[] = [
  { value: '1', label: 'Chile', labelPt: 'Chile' },
  { value: '2', label: 'Colombia', labelPt: 'Colômbia' },
];

// --- Ciudad (A09) — showIf por país ----------------------------------------

export const CIUDADES: QuestionOption[] = [
  { value: 'santiago', label: 'Santiago', showIf: pais('1') },
  { value: 'antofagasta', label: 'Antofagasta', showIf: pais('1') },
  { value: 'concepcion', label: 'Concepción', showIf: pais('1') },
  { value: 'bogota', label: 'Bogotá', showIf: pais('2') },
  { value: 'medellin', label: 'Medellín', showIf: pais('2') },
  { value: 'cali', label: 'Cali', showIf: pais('2') },
];

// --- Marketplace / competidor (A07) ----------------------------------------

/** Slugs estables de competidores (documentado: el doc no trae códigos). */
export const COMPETIDOR_SLUGS = ['falabella', 'amazon', 'temu'] as const;

export const COMPETIDORES: QuestionOption[] = [
  { value: 'falabella', label: 'Falabella' },
  { value: 'amazon', label: 'Amazon' },
  { value: 'temu', label: 'Temu' },
];

// --- Enviado por (A12) — mismo catálogo que marketplace --------------------

export const ENVIADO_POR: QuestionOption[] = [
  { value: 'falabella', label: 'Falabella' },
  { value: 'amazon', label: 'Amazon' },
  { value: 'temu', label: 'Temu' },
];

// --- Vendido por (A13) — marketplace + "Otro ¿Cuál?" + filtro 1P -----------

export const VENDIDO_POR: QuestionOption[] = [
  {
    value: 'falabella',
    label: 'Falabella',
    showIf: vendidoPorSi1P('falabella'),
  },
  {
    value: 'amazon',
    label: 'Amazon',
    showIf: vendidoPorSi1P('amazon'),
  },
  {
    value: 'temu',
    label: 'Temu',
    showIf: vendidoPorSi1P('temu'),
  },
  {
    value: 'otro',
    label: 'Otro ¿Cuál?',
    showIf: neq('q16-inventario', '1p'),
  },
];

/** Código de VENDIDO_POR que abre el campo de texto libre "¿Cuál?". */
export const VENDIDO_POR_OTRO = 'otro';

// --- Categorías del producto (A10) — códigos 1–11 + 97 ----------------------

export const CATEGORIAS: QuestionOption[] = [
  { value: '1', label: 'Accesorios para vehículos' },
  { value: '2', label: 'Artículos para el hogar (Excepto cocina)' },
  { value: '3', label: 'Computación e informática' },
  { value: '4', label: 'Indumentaria y Accesorios' },
  { value: '5', label: 'Ropa de cama' },
  {
    value: '6',
    label:
      'Pequeños Electrodomésticos (artefactos eléctricos excepto alisadora de pelo, máquina de afeitar, etc.)',
  },
  { value: '7', label: 'Herramientas/Maquinaria pequeña/Ferretería' },
  { value: '8', label: 'Salud, belleza y bienestar' },
  { value: '9', label: 'Juegos de mesa/Juguetería' },
  { value: '10', label: 'Artículos de Cocina (set de cubiertos/cuchillos/etc.)' },
  {
    value: '11',
    label:
      'Artículos Deportivos* (Incluye pelotas de fútbol, tenis, rugby, paletas, raquetas, etc.) ',
  },
  { value: '97', label: 'Otros (especificar)' },
];

/** Código de CATEGORIAS que corresponde a "Otros (especificar)". */
export const CATEGORIA_OTRO = '97';

// --- Monedas (A11.1 / A20.1 / A21.1 / F13.1) --------------------------------
/** Labels sin (SOLO CHI/COL/TODOS): el showIf ya filtra por país. */
export const MONEDAS: QuestionOption[] = [
  { value: '1', label: 'Pesos chilenos', showIf: pais('1') },
  { value: '2', label: 'Pesos colombianos', showIf: pais('2') },
  { value: '3', label: 'Dólares estadounidenses' },
];

// --- Logística (A14) — códigos 1/2 del Word ---------------------------------

export const LOGISTICA: QuestionOption[] = [
  { value: '1', label: 'Player' },
  { value: '2', label: 'Seller' },
];

// --- Inventario (A16) -------------------------------------------------------

export const INVENTARIO: QuestionOption[] = [
  { value: '1p', label: '1P' },
  { value: '3p', label: '3P' },
];

// --- Medios de notificación (C01.1 … C04.1) — 97 = Otro --------------------

export const MEDIOS_NOTIFICACION: QuestionOption[] = [
  { value: '1', label: 'Mail / Correo electrónico' },
  { value: '2', label: 'WhatsApp' },
  { value: '3', label: 'Sitio web' },
  { value: '4', label: 'App' },
  { value: '5', label: 'SMS' },
  { value: '97', label: 'Otro ¿Cuál?' },
];

/** Código de MEDIOS_NOTIFICACION que abre el campo de texto libre. */
export const MEDIO_OTRO = '97';

/** Métodos de entrega (A19) */
export const METODOS_ENTREGA: QuestionOption[] = [
  { value: '1', label: 'Envío Rápido con costo de envío (pago)' },
  { value: '2', label: 'Envío Rápido sin costo de envío (gratis)' },
];

/** Entrega a tiempo (F03) */
export const ENTREGA_TIEMPO: QuestionOption[] = [
  {
    value: '1',
    label: 'Tarde: llega después de la fecha/rango de fechas prometidas',
  },
  {
    value: '2',
    label: 'A tiempo: llega dentro de la fecha/rango de fechas prometidas',
  },
  {
    value: '3',
    label: 'Temprano: llega antes de la fecha/rango de fechas prometidas',
  },
  {
    value: '4',
    label:
      'Nunca llegó: el producto no fue entregado o tuvo una demora mayor a 10 días naturales desde fecha de promesa.',
  },
  {
    value: '5',
    label: 'No se entregó: el marketplace canceló la compra',
  },
];

// ============================================================
// Catálogos legacy (screening Etapa 1)
// ============================================================

export const REGIONES: QuestionOption[] = [
  ...CIUDADES.map((c) => ({ value: c.value, label: c.label })),
  { value: 'otro', label: 'Otro', labelPt: 'Outro' },
];

export const MARCAS: QuestionOption[] = COMPETIDORES.map((c) => ({
  value: c.value,
  label: c.label,
}));

/** Código legacy de MARCAS "otra" (screening Etapa 1). */
export const MARCA_OTRA_CODE = '99';

export const CANALES: QuestionOption[] = [
  { value: '1', label: 'App móvil', labelPt: 'App móvel' },
  { value: '2', label: 'Web', labelPt: 'Web' },
];

// ============================================================
// Evidencias opcionales al final de cada parte
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
