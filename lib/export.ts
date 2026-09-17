import {
  surveySections,
  getSectionTitle,
  getMaxApprovedStage,
  REVIEWABLE_SECTIONS,
} from './survey-config';
import { getAnswerLabel, isEvidence, formatQuestionText } from './format';
import { parseAmount } from './survey-config/computed';
import {
  getAllQuestions,
  getAllQuestionsFromSection,
  getSectionQuestionIds,
  isClientVisibleQuestion,
  isQuestionVisible,
} from './survey-logic';
import { getScreeningSnapshot } from './survey-snapshot';
import {
  AnswerValue,
  PublicResult,
  Question,
  StagesMap,
  StageStatus,
  SurveyResponse,
} from './types';

/** Etiquetas de estado por parte para la exportación de Revisión */
const STAGE_STATUS_EXPORT_LABEL: Record<StageStatus, string> = {
  pendiente: 'Pendiente',
  en_revision: 'En revisión',
  revisado: 'Revisado',
  aprobada: 'Aprobada',
  a_corregir: 'Pendiente de corrección',
  rechazada: 'Rechazada',
  cancelada_player: 'Cancelada por player',
};

/** Celda CSV estándar (delimitador coma). */
function csvCell(value: string): string {
  const v = value ?? '';
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** Celda CSV latino (delimitador `;`; coma decimal en números). */
function csvCellLatin(value: string | number): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(value).replace('.', ',');
  }
  const v = value ?? '';
  if (/[";\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** ¿La sección está aprobada para export público al cliente? */
function isApprovedSection(
  stages: StagesMap | undefined,
  sectionId: string
): boolean {
  return stages?.[sectionId]?.status === 'aprobada';
}

/** Mapa questionId → sectionId (una sola vez por export). */
function buildQuestionSectionMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const section of surveySections) {
    for (const questionId of getSectionQuestionIds(section)) {
      map.set(questionId, section.id);
    }
  }
  return map;
}

/**
 * Etiqueta/pregunta sin el código repetido (ej. "A01. Fecha…" → "Fecha…").
 * Si no hay codigoOriginal o el texto no lo trae, se usa el texto completo.
 */
function questionLabelForExport(q: Question): string {
  const text = formatQuestionText(q.text);
  if (!q.codigoOriginal) return text;
  const escaped = q.codigoOriginal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stripped = text.replace(new RegExp(`^${escaped}\\.\\s*`), '').trim();
  return stripped || text;
}

/**
 * Valor de celda para export: números reales (type number / montos) o texto.
 * Así Excel local (CL/CO) muestra coma decimal y permite SUMA/filtros.
 */
function exportCellValue(q: Question, value: AnswerValue): string | number {
  if (isEvidence(value)) {
    return value.map((f) => f.url).join(' | ');
  }
  if (q.type === 'number') {
    const n = parseAmount(value);
    if (n !== null) return n;
  }
  return getAnswerLabel(q.id, value);
}

type ExportRow = SurveyResponse | PublicResult;
type ExportCell = string | number;

type BuildOptions = {
  /** Modo revisión: columnas de screening + estado por parte (en lugar de "Etapa alcanzada") */
  review?: boolean;
};

type BuiltExport = {
  /** Fila 1: códigos (A01) o títulos de columnas fijas */
  headerCodes: string[];
  /** Fila 2: etiquetas/preguntas (vacía en columnas fijas) */
  headerLabels: string[];
  rows: ExportCell[][];
};

/** Arma encabezados (2 filas) y filas tipadas para CSV/Excel/PDF */
function buildExportRows(
  responses: ExportRow[],
  options: BuildOptions = {}
): BuiltExport {
  const review = Boolean(options.review);
  // En export de cliente (/resultados) se omiten preguntas internalOnly
  const questions = getAllQuestions(surveySections).filter(
    (q) => review || isClientVisibleQuestion(q)
  );
  // Solo en modo cliente: vaciar celdas de etapas no aprobadas
  const questionSectionMap = review ? null : buildQuestionSectionMap();

  const fixedCodes = review
    ? [
        'ID',
        'Código',
        'Nombre',
        'Empresa',
        'País',
        'Ciudad',
        'Parte 1',
        'Parte 2',
        'Parte 3',
      ]
    : ['ID', 'Código', 'Nombre', 'Empresa', 'Ciudad', 'Etapa alcanzada'];

  const headerCodes = [
    ...fixedCodes,
    ...questions.map((q) => q.codigoOriginal ?? formatQuestionText(q.text)),
  ];
  const headerLabels = [
    ...fixedCodes.map(() => ''),
    ...questions.map((q) => questionLabelForExport(q)),
  ];

  const rows = responses.map((r) => {
    const code = 'code' in r ? r.code : undefined;
    const name =
      r.nombreApellido ||
      [r.nombre, r.apellido].filter(Boolean).join(' ') ||
      '';
    const stages = 'stages' in r ? r.stages : undefined;

    let cells: ExportCell[];

    if (review) {
      const snapshot = getScreeningSnapshot(r.answers);
      cells = [
        r.id,
        code || '',
        name,
        snapshot.marca || r.empresa || '',
        snapshot.pais || '',
        r.ciudad || '',
        ...REVIEWABLE_SECTIONS.map((sectionId) => {
          const status = stages?.[sectionId]?.status as StageStatus | undefined;
          return status ? STAGE_STATUS_EXPORT_LABEL[status] || status : '';
        }),
      ];
    } else {
      // Preferir maxApprovedStage del RPC; si falta (p.ej. toSurveyResponse), derivarlo de stages
      const maxStageId =
        ('maxApprovedStage' in r && r.maxApprovedStage) ||
        (stages ? getMaxApprovedStage(stages) : null);
      const maxStage = maxStageId ? getSectionTitle(maxStageId) : '';
      cells = [
        r.id,
        code || '',
        name,
        r.empresa || '',
        r.ciudad || '',
        maxStage,
      ];
    }

    for (const q of questions) {
      // Export cliente: no incluir respuestas de etapas aún no aprobadas
      if (questionSectionMap) {
        const sectionId = questionSectionMap.get(q.id);
        if (sectionId && !isApprovedSection(stages, sectionId)) {
          cells.push('');
          continue;
        }
      }
      if (!isQuestionVisible(q, r.answers)) {
        cells.push('');
        continue;
      }
      const value = r.answers[q.id];
      if (value === undefined) {
        cells.push('');
      } else {
        cells.push(exportCellValue(q, value));
      }
    }
    return cells;
  });

  return { headerCodes, headerLabels, rows };
}

/** Congela las 2 filas de encabezado en Excel. */
function freezeHeaderRows(ws: Record<string, unknown>) {
  ws['!views'] = [{ state: 'frozen', ySplit: 2, topLeftCell: 'A3' }];
}

export function exportResponsesToCsv(
  responses: ExportRow[],
  filename = 'meli-resultados.csv'
) {
  const { headerCodes, headerLabels, rows } = buildExportRows(responses);
  // CSV latino: `;` + coma decimal para que Excel CL/CO abra bien los números
  const csv = [headerCodes, headerLabels, ...rows]
    .map((row) => row.map((c) => csvCellLatin(c)).join(';'))
    .join('\n');

  downloadBlob(
    new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }),
    filename
  );
}

export async function exportResponsesToExcel(
  responses: ExportRow[],
  filename = 'meli-resultados.xlsx'
) {
  const XLSX = await import('xlsx');
  const { headerCodes, headerLabels, rows } = buildExportRows(responses);
  const ws = XLSX.utils.aoa_to_sheet([headerCodes, headerLabels, ...rows]);
  freezeHeaderRows(ws as unknown as Record<string, unknown>);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Resultados');
  XLSX.writeFile(wb, filename);
}

export async function exportResponsesToPdf(
  responses: ExportRow[],
  filename = 'meli-resultados.pdf'
) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape' });
  const { headerCodes, rows } = buildExportRows(responses);

  autoTable(doc, {
    head: [headerCodes.slice(0, 8)],
    body: rows.map((r) => r.slice(0, 8).map(String)),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175] },
    margin: { top: 20 },
  });

  doc.save(filename);
}

/** Exportación CSV para la pestaña Revisión (incluye estado por parte) */
export function exportReviewToCsv(
  responses: SurveyResponse[],
  filename = 'meli-revision.csv'
) {
  const { headerCodes, rows } = buildExportRows(responses, { review: true });
  // Revisión interna: CSV clásico con coma (sin cambio de locale)
  const csv = [headerCodes, ...rows]
    .map((row) => row.map((c) => csvCell(String(c))).join(','))
    .join('\n');

  downloadBlob(
    new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }),
    filename
  );
}

/** Exportación Excel para la pestaña Revisión (incluye estado por parte) */
export async function exportReviewToExcel(
  responses: SurveyResponse[],
  filename = 'meli-revision.xlsx'
) {
  const XLSX = await import('xlsx');
  const { headerCodes, rows } = buildExportRows(responses, { review: true });
  const ws = XLSX.utils.aoa_to_sheet([headerCodes, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Revisión');
  XLSX.writeFile(wb, filename);
}

// Re-export for consumers that need section question flattening
export { getAllQuestionsFromSection };
