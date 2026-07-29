import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { isEvidence } from '@/lib/format';
import { REVIEWABLE_SECTIONS, getSectionTitle } from '@/lib/survey-config';
import { EvidenceFile, SurveyResponse } from '@/lib/types';

/** Nombre legible del shopper para usar como nombre del .zip. */
export function responseDisplayName(r: SurveyResponse): string {
  return (
    r.nombreApellido ||
    [r.nombre, r.apellido].filter(Boolean).join(' ') ||
    r.code ||
    r.id ||
    'encuesta'
  );
}

/** Sanitiza un string para usarlo como nombre de archivo. */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'encuesta';
}

/** Clave de answers donde viven las evidencias de una parte. */
function evidenceAnswerKey(sectionId: string): string {
  return `evidencia-${sectionId}`;
}

/** Extrae las evidencias de una parte concreta. */
export function collectPartEvidences(
  response: SurveyResponse,
  sectionId: string
): EvidenceFile[] {
  const raw = response.answers?.[evidenceAnswerKey(sectionId)];
  if (!raw || !isEvidence(raw)) return [];
  return raw;
}

/** Indica si la encuesta tiene al menos una evidencia en alguna parte. */
export function hasAnyEvidences(response: SurveyResponse): boolean {
  return REVIEWABLE_SECTIONS.some(
    (id) => collectPartEvidences(response, id).length > 0
  );
}

/**
 * Descarga un archivo remoto como Blob.
 * Las evidencias viven en URLs públicas de Supabase Storage.
 */
async function fetchAsBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`No se pudo descargar ${url} (${res.status})`);
  }
  return res.blob();
}

/**
 * Agrega archivos al zip evitando colisiones de nombre
 * (mismo nombre → prefijo con índice).
 */
function addFilesToFolder(
  folder: JSZip,
  files: EvidenceFile[],
  usedNames: Set<string>
) {
  files.forEach((file, index) => {
    let name = sanitizeFileName(file.name || `evidencia-${index + 1}`);
    if (usedNames.has(name.toLowerCase())) {
      const dot = name.lastIndexOf('.');
      const base = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : '';
      name = `${base}-${index + 1}${ext}`;
    }
    usedNames.add(name.toLowerCase());
    folder.file(name, fetchAsBlob(file.url));
  });
}

/**
 * Descarga las evidencias de una sola parte como .zip.
 * Nombre: "{displayName} - Parte N.zip"
 */
export async function downloadPartZip(
  response: SurveyResponse,
  sectionId: string
): Promise<void> {
  const files = collectPartEvidences(response, sectionId);
  if (files.length === 0) {
    throw new Error('Esta parte no tiene evidencias adjuntas');
  }

  const zip = new JSZip();
  const usedNames = new Set<string>();
  addFilesToFolder(zip, files, usedNames);

  const partLabel = getSectionTitle(sectionId).replace(/\s*—.*$/, '').trim() || sectionId;
  const zipName = `${sanitizeFileName(responseDisplayName(response))} - ${sanitizeFileName(partLabel)}.zip`;

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, zipName);
}

/**
 * Descarga todas las evidencias de la encuesta en un .zip
 * con subcarpetas Parte 1 / Parte 2 / Parte 3.
 * Nombre: "{displayName}.zip"
 */
export async function downloadAllZip(response: SurveyResponse): Promise<void> {
  const zip = new JSZip();
  let total = 0;

  for (const sectionId of REVIEWABLE_SECTIONS) {
    const files = collectPartEvidences(response, sectionId);
    if (files.length === 0) continue;

    const partNumber = REVIEWABLE_SECTIONS.indexOf(sectionId) + 1;
    const folderName = `Parte ${partNumber}`;
    const folder = zip.folder(folderName);
    if (!folder) continue;

    const usedNames = new Set<string>();
    addFilesToFolder(folder, files, usedNames);
    total += files.length;
  }

  if (total === 0) {
    throw new Error('No hay evidencias adjuntas en esta encuesta');
  }

  const zipName = `${sanitizeFileName(responseDisplayName(response))}.zip`;
  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, zipName);
}
