import { Condition, ConditionClause, QuestionOption, SurveyModule } from '../types';

// ============================================================
// Catálogos y condiciones — Cuestionario Mercado Envíos (Etapa 2)
//
// Fidelidad textual: los labels se transcriben LITERALMENTE desde
// incoming/compacto.txt (se conservan tildes, mayúsculas, dobles espacios
// y typos). No corregir.
//
// ⚠️ PUNTOS ACOPLADOS AL SQL / DASHBOARD:
//   - 'f1-pais' precargado por meli_admin_create_postulante
//   - Allowlist de screening: migración 0002 (q8-competidor, q10-ciudad,
//     q11-categoria, q32-entrega-tiempo, ola) + lib/survey-snapshot.ts
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

// --- Sí / No ----------------------------------------------------------------

export const SI_NO_COD: QuestionOption[] = [
  { value: '1', label: 'Sí', labelPt: 'Sim' },
  { value: '2', label: 'No', labelPt: 'Não' },
];

/** Sí / No / N/A (código 99). */
export const SI_NO_NA: QuestionOption[] = [
  { value: '1', label: 'Sí', labelPt: 'Sim' },
  { value: '2', label: 'No', labelPt: 'Não' },
  { value: '99', label: 'N/A', labelPt: 'N/A' },
];

// --- País (VARIABLE AUXILIAR: Chile=1, Colombia=2) --------------------------

export const PAISES: QuestionOption[] = [
  { value: '1', label: 'Chile', labelPt: 'Chile' },
  { value: '2', label: 'Colombia', labelPt: 'Colômbia' },
];

// --- Ciudad (pregunta 10) — showIf por país ---------------------------------
// Slugs estables (el documento no trae códigos numéricos de ciudad).

export const CIUDADES: QuestionOption[] = [
  { value: 'santiago', label: 'Santiago', showIf: pais('1') },
  { value: 'antofagasta', label: 'Antofagasta', showIf: pais('1') },
  { value: 'concepcion', label: 'Concepción', showIf: pais('1') },
  { value: 'bogota', label: 'Bogotá', showIf: pais('2') },
  { value: 'medellin', label: 'Medellín', showIf: pais('2') },
  { value: 'cali', label: 'Cali', showIf: pais('2') },
];

// --- Competidor (pregunta 8) ------------------------------------------------
// Slugs estables (el documento trae códigos vacíos). Amazon solo Colombia.

/** Slugs estables de competidores (documentado: el doc no trae códigos). */
export const COMPETIDOR_SLUGS = ['falabella', 'ali-express', 'amazon', 'temu'] as const;

export const COMPETIDORES: QuestionOption[] = [
  { value: 'falabella', label: 'Falabella' },
  { value: 'ali-express', label: 'Ali Express' },
  { value: 'amazon', label: 'Amazon', showIf: pais('2') },
  { value: 'temu', label: 'Temu' },
];

// --- Enviado por (pregunta 13) — mismo catálogo que competidor --------------

export const ENVIADO_POR: QuestionOption[] = [
  { value: 'falabella', label: 'Falabella' },
  { value: 'ali-express', label: 'Ali Express' },
  { value: 'amazon', label: 'Amazon', showIf: pais('2') },
  { value: 'temu', label: 'Temu' },
];

// --- Vendido por (pregunta 14) — competidor + "Otro" ------------------------

export const VENDIDO_POR: QuestionOption[] = [
  { value: 'falabella', label: 'Falabella' },
  { value: 'ali-express', label: 'Ali Express' },
  { value: 'amazon', label: 'Amazon', showIf: pais('2') },
  { value: 'temu', label: 'Temu' },
  { value: 'otro', label: 'Otro' },
];

/** Código de VENDIDO_POR que abre el campo de texto libre "¿Cuál?". */
export const VENDIDO_POR_OTRO = 'otro';

// --- Categorías del producto (pregunta 11) — códigos 1–19 -------------------

export const CATEGORIAS: QuestionOption[] = [
  { value: '1', label: 'Accesorios para vehículos' },
  { value: '2', label: 'Artículos de supermercado (alimentos, bebidas, artículos de limpieza, etc.)' },
  { value: '3', label: 'Artículos para el hogar (Excepto cocina)' },
  { value: '4', label: 'Celulares/teléfonos' },
  { value: '5', label: 'Computación e informática' },
  { value: '6', label: 'Electrónica, audio y videos' },
  { value: '7', label: 'Indumentaria y Accesorios' },
  { value: '8', label: 'Libros digitales/electrónicos (E-books)' },
  { value: '9', label: 'Libros en papel' },
  { value: '10', label: 'Ropa de cama' },
  {
    value: '11',
    label:
      'Pequeños Electrodomésticos (artefactos eléctricos excepto alisadora de pelo, máquina de afeitar, etc.)',
  },
  { value: '12', label: 'Herramientas/Maquinaria pequeña/Ferretería' },
  { value: '13', label: 'Salud, belleza y bienestar' },
  { value: '14', label: 'Video juegos' },
  { value: '15', label: 'Juegos de mesa/Juguetería' },
  { value: '16', label: 'Artículos de Cocina (set de cubiertos/cuchillos/etc.)' },
  { value: '17', label: 'Mascotas (Alimento y accesorios)' },
  {
    value: '18',
    label:
      'Artículos Deportivos* (Incluye pelotas de fútbol, tenis, rugby, paletas, raquetas, etc.) ',
  },
  { value: '19', label: 'Otros (especificar)' },
];

/** Código de CATEGORIAS que corresponde a "Otros (especificar)". */
export const CATEGORIA_OTRO = '19';

// --- Monedas (12.1 / 19.1 / 19a.1 / 46c.1) ----------------------------------
// 1=CLP (solo Chile), 2=COP (solo Colombia), 3=USD (ambos).

export const MONEDAS: QuestionOption[] = [
  { value: '1', label: 'Pesos chilenos (SOLO CHI)', showIf: pais('1') },
  { value: '2', label: 'Pesos colombianos (SOLO COL)', showIf: pais('2') },
  { value: '3', label: 'Dólares estadounidenses (TODOS)' },
];

// --- Logística (pregunta 15) ------------------------------------------------

export const LOGISTICA: QuestionOption[] = [
  { value: 'player', label: 'Player' },
  { value: 'seller', label: 'Seller' },
];

// --- Inventario (pregunta 16) -----------------------------------------------

export const INVENTARIO: QuestionOption[] = [
  { value: '1p', label: '1P' },
  { value: '3p', label: '3P' },
];

// --- Medios de notificación (27a/28a/29a/30a) — 97 = Otro -------------------

export const MEDIOS_NOTIFICACION: QuestionOption[] = [
  { value: '1', label: 'Mail/Correo Electrónico' },
  { value: '2', label: 'Whatsapp' },
  { value: '3', label: 'Site/Página Web' },
  { value: '4', label: 'App' },
  { value: '5', label: 'SMS' },
  { value: '97', label: 'Otro ¿Cuál?' },
];

/** Código de MEDIOS_NOTIFICACION que abre el campo de texto libre. */
export const MEDIO_OTRO = '97';

// --- Transportadoras (38.Q1.22.a nacional / 38.Q1.22.b internacional) -------
// Catálogos crudos (sin showIf). Se combinan por país en parte-3 con withPais.

export const TRANSPORTADORAS_NAC_CL: QuestionOption[] = [
  { value: '1', label: '99 Minutos' },
  { value: '2', label: 'Blue Express Copec' },
  { value: '3', label: 'Chilexpress' },
  { value: '4', label: 'Flapp' },
  { value: '97', label: 'Otros especificar:' },
  { value: '98', label: 'No especifica' },
  { value: '99', label: 'No sabe' },
];

export const TRANSPORTADORAS_NAC_CO: QuestionOption[] = [
  { value: '1', label: 'IBIS' },
  { value: '2', label: 'PASAREX' },
  { value: '3', label: 'XCARGO' },
  { value: '97', label: 'Otros especificar:' },
  { value: '98', label: 'No especifica' },
  { value: '99', label: 'No sabe' },
];

// Chile internacional: la tabla del documento solo trae 97/98/99
// (el código 1 venía con label vacío → se omite).
export const TRANSPORTADORAS_INT_CL: QuestionOption[] = [
  { value: '97', label: 'Otros especificar:' },
  { value: '98', label: 'No especifica' },
  { value: '99', label: 'No sabe' },
];

export const TRANSPORTADORAS_INT_CO: QuestionOption[] = [
  { value: '1', label: 'BEYOND BORDER INTERNACIONAL COURIER SAS' },
  { value: '2', label: 'PASAREX' },
  { value: '3', label: 'XCARGO' },
  { value: '97', label: 'Otros especificar:' },
  { value: '98', label: 'No especifica' },
  { value: '99', label: 'No sabe' },
];

/** Código "Otros especificar:" de las transportadoras (abre texto libre). */
export const TRANSPORTADORA_OTRO = '97';

/** Transportadoras nacionales con showIf por país (valores 1/2/3/97… del doc). */
export const TRANSPORTADORAS_NAC: QuestionOption[] = [
  ...withPais('1', TRANSPORTADORAS_NAC_CL),
  ...withPais('2', TRANSPORTADORAS_NAC_CO),
];

/** Transportadoras internacionales con showIf por país. */
export const TRANSPORTADORAS_INT: QuestionOption[] = [
  ...withPais('1', TRANSPORTADORAS_INT_CL),
  ...withPais('2', TRANSPORTADORAS_INT_CO),
];

/** Métodos de entrega (pregunta 18) */
export const METODOS_ENTREGA: QuestionOption[] = [
  { value: '1', label: 'Envío Rápido con costo de envío (pago)' },
  { value: '2', label: 'Envío Rápido sin costo de envío (gratis)' },
];

/** Entrega a tiempo (pregunta 32) */
export const ENTREGA_TIEMPO: QuestionOption[] = [
  {
    value: '1',
    label: 'Tarde: llega después de la fecha/rango de fechas prometidas',
  },
  {
    value: '2',
    label: 'A Tiempo: llega dentro de la fecha/rango de fechas prometidas',
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
    label: 'No se entregó: el Market Place canceló la compra',
  },
];

// ============================================================
// Catálogos legacy (screening Etapa 1)
//
// Snapshot ya migra a q8/q10/q11; se conservan stubs por imports residuales.
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
