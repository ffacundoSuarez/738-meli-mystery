import { surveySections, getSectionTitle, REVIEWABLE_SECTIONS } from './survey-config';
import { getAnswerLabel, isEvidence, formatQuestionText } from './format';
import {
  getAllQuestions,
  getAllQuestionsFromSection,
  isQuestionVisible,
} from './survey-logic';
import { getScreeningSnapshot } from './survey-snapshot';
import { PublicResult, StageStatus, SurveyResponse } from './types';

/** Etiquetas de estado por parte para la exportación de Revisión */
const STAGE_STATUS_EXPORT_LABEL: Record<StageStatus, string> = {
  pendiente: 'Pendiente',
  en_revision: 'En revisión',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
};

function csvCell(value: string): string {
  const v = value ?? '';
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
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

type ExportRow = SurveyResponse | PublicResult;

type BuildOptions = {
  /** Modo revisión: columnas de screening + estado por parte (en lugar de "Etapa alcanzada") */
  review?: boolean;
};

/** Arma encabezados y filas para CSV/Excel/PDF */
function buildExportRows(responses: ExportRow[], options: BuildOptions = {}) {
  const questions = getAllQuestions(surveySections);
  const review = Boolean(options.review);

  const headers = review
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
        ...questions.map((q) => formatQuestionText(q.text)),
      ]
    : [
        'ID',
        'Código',
        'Nombre',
        'Empresa',
        'Ciudad',
        'Etapa alcanzada',
        ...questions.map((q) => formatQuestionText(q.text)),
      ];

  const rows = responses.map((r) => {
    const code = 'code' in r ? r.code : undefined;
    const name =
      r.nombreApellido ||
      [r.nombre, r.apellido].filter(Boolean).join(' ') ||
      '';

    let cells: string[];

    if (review) {
      const snapshot = getScreeningSnapshot(r.answers);
      const stages = 'stages' in r ? r.stages : undefined;
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
      const maxStage =
        'maxApprovedStage' in r && r.maxApprovedStage
          ? getSectionTitle(r.maxApprovedStage)
          : '';
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
      if (!isQuestionVisible(q, r.answers)) {
        cells.push('');
        continue;
      }
      const value = r.answers[q.id];
      if (value === undefined) {
        cells.push('');
      } else if (isEvidence(value)) {
        cells.push(value.map((f) => f.url).join(' | '));
      } else {
        cells.push(getAnswerLabel(q.id, value));
      }
    }
    return cells;
  });

  return { headers, rows };
}

export function exportResponsesToCsv(
  responses: ExportRow[],
  filename = 'meli-resultados.csv'
) {
  const { headers, rows } = buildExportRows(responses);
  const csv = [headers, ...rows]
    .map((row) => row.map((c) => csvCell(String(c))).join(','))
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
  const { headers, rows } = buildExportRows(responses);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
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
  const { headers, rows } = buildExportRows(responses);

  autoTable(doc, {
    head: [headers.slice(0, 8)],
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
  const { headers, rows } = buildExportRows(responses, { review: true });
  const csv = [headers, ...rows]
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
  const { headers, rows } = buildExportRows(responses, { review: true });
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Revisión');
  XLSX.writeFile(wb, filename);
}

// Re-export for consumers that need section question flattening
export { getAllQuestionsFromSection };
