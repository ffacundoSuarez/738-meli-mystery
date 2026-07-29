import { supabase, EVIDENCE_BUCKET } from './supabase/client';
import { HEADER_FIELDS } from './survey-config';
import { getOpsPasscode, requireOpsPasscode } from './auth';
import {
  AnswerValue,
  EvidenceFile,
  Lang,
  PendingReviewItem,
  PostulanteSummary,
  PublicResult,
  ResponseStatus,
  ReviewFlagsMap,
  StagesMap,
  SurveyResponse,
} from './types';

// --- Mapeo JSON ↔ modelo de la app ----------------------------------------

function parseResponse(raw: Record<string, unknown>): SurveyResponse {
  return {
    id: String(raw.id),
    code: raw.code as string | undefined,
    accessToken: raw.accessToken as string | undefined,
    idioma: (raw.idioma as Lang) || 'es',
    nombre: raw.nombre as string | undefined,
    apellido: raw.apellido as string | undefined,
    nombreApellido: raw.nombreApellido as string | undefined,
    empresa: raw.empresa as string | undefined,
    ciudad: raw.ciudad as string | undefined,
    fechaInicio: raw.fechaInicio as string | undefined,
    fechaFin: raw.fechaFin as string | undefined,
    ultimaEtapa: raw.ultimaEtapa as string | undefined,
    status: (raw.status as ResponseStatus) || 'borrador',
    stages: (raw.stages as StagesMap) || {},
    reviewFlags: (raw.reviewFlags as ReviewFlagsMap) || {},
    answers: (raw.answers as Record<string, AnswerValue>) || {},
    reviewedAt: raw.reviewedAt as string | undefined,
    reviewedBy: raw.reviewedBy as string | undefined,
    isPrueba: Boolean(raw.isPrueba),
    createdAt: String(raw.createdAt),
    updatedAt: String(raw.updatedAt),
  };
}

function parsePendingReview(raw: Record<string, unknown>): PendingReviewItem {
  return {
    id: String(raw.id),
    code: raw.code as string | undefined,
    accessToken: raw.accessToken as string | undefined,
    idioma: (raw.idioma as Lang) || 'es',
    nombre: raw.nombre as string | undefined,
    apellido: raw.apellido as string | undefined,
    nombreApellido: raw.nombreApellido as string | undefined,
    empresa: raw.empresa as string | undefined,
    ciudad: raw.ciudad as string | undefined,
    sectionId: String(raw.sectionId),
    stages: (raw.stages as StagesMap) || {},
    reviewFlags: (raw.reviewFlags as ReviewFlagsMap) || {},
    answers: (raw.answers as Record<string, AnswerValue>) || {},
    updatedAt: String(raw.updatedAt),
  };
}

function parsePublicResult(raw: Record<string, unknown>): PublicResult {
  return {
    id: String(raw.id),
    code: raw.code as string | undefined,
    nombre: raw.nombre as string | undefined,
    apellido: raw.apellido as string | undefined,
    nombreApellido: raw.nombreApellido as string | undefined,
    empresa: raw.empresa as string | undefined,
    ciudad: raw.ciudad as string | undefined,
    maxApprovedStage: raw.maxApprovedStage as string | undefined,
    stages: (raw.stages as StagesMap) || {},
    answers: (raw.answers as Record<string, AnswerValue>) || {},
    updatedAt: String(raw.updatedAt),
  };
}

function parsePostulante(raw: Record<string, unknown>): PostulanteSummary {
  return {
    id: String(raw.id),
    code: raw.code as string | undefined,
    accessToken: raw.accessToken as string | undefined,
    idioma: (raw.idioma as Lang) || 'es',
    nombre: raw.nombre as string | undefined,
    apellido: raw.apellido as string | undefined,
    nombreApellido: raw.nombreApellido as string | undefined,
    empresa: raw.empresa as string | undefined,
    ciudad: raw.ciudad as string | undefined,
    stages: raw.stages as StagesMap | undefined,
    reviewFlags: (raw.reviewFlags as ReviewFlagsMap) || undefined,
    answers: (raw.answers as Record<string, AnswerValue>) || undefined,
    status: raw.status as ResponseStatus | undefined,
    isPrueba: Boolean(raw.isPrueba),
    createdAt: String(raw.createdAt),
    updatedAt: raw.updatedAt as string | undefined,
  };
}

void HEADER_FIELDS;

// --- Postulante (access_token) --------------------------------------------

export async function getResponseByToken(
  accessToken: string
): Promise<SurveyResponse | null> {
  const { data, error } = await supabase.rpc('meli_get_response_by_token', {
    p_token: accessToken,
  });
  if (error) throw error;
  if (!data) return null;
  return parseResponse(data as Record<string, unknown>);
}

export async function saveStageByToken(
  accessToken: string,
  sectionId: string,
  answers: Record<string, AnswerValue>,
  submitForReview = true
): Promise<SurveyResponse> {
  const { data, error } = await supabase.rpc('meli_save_stage_by_token', {
    p_token: accessToken,
    p_section_id: sectionId,
    p_answers: answers,
    p_submit_for_review: submitForReview,
  });
  if (error) throw error;
  return parseResponse(data as Record<string, unknown>);
}

// --- Vista pública --------------------------------------------------------

export async function getPublicResults(): Promise<PublicResult[]> {
  const { data, error } = await supabase.rpc('meli_get_public_results');
  if (error) throw error;
  return ((data as Record<string, unknown>[]) || []).map(parsePublicResult);
}

// --- Admin (passcode) -----------------------------------------------------

export async function adminCreatePostulante(
  nombreApellido: string,
  pais: string,
  idioma: Lang = 'es',
  reclutador?: string,
  isPrueba = false
): Promise<PostulanteSummary> {
  const { data, error } = await supabase.rpc('meli_admin_create_postulante', {
    p_passcode: requireOpsPasscode(),
    p_nombre_apellido: nombreApellido,
    p_pais: pais,
    p_idioma: idioma,
    p_reclutador: reclutador?.trim() || null,
    p_is_prueba: isPrueba,
  });
  if (error) throw error;
  return parsePostulante(data as Record<string, unknown>);
}

export async function adminListPostulantes(): Promise<PostulanteSummary[]> {
  const { data, error } = await supabase.rpc('meli_admin_list_postulantes', {
    p_passcode: requireOpsPasscode(),
  });
  if (error) throw error;
  return ((data as Record<string, unknown>[]) || []).map(parsePostulante);
}

export async function adminGetResponses(): Promise<SurveyResponse[]> {
  const { data, error } = await supabase.rpc('meli_admin_get_responses', {
    p_passcode: requireOpsPasscode(),
  });
  if (error) throw error;
  return ((data as Record<string, unknown>[]) || []).map(parseResponse);
}

/** Listado liviano para el panel: stages + screening en answers (sin evidencias ni matrices). */
export async function adminListResponsesSummary(): Promise<SurveyResponse[]> {
  const { data, error } = await supabase.rpc('meli_admin_list_responses_summary', {
    p_passcode: requireOpsPasscode(),
  });
  if (error) throw error;
  return ((data as Record<string, unknown>[]) || []).map(parseResponse);
}

export async function adminGetPendingReviews(): Promise<PendingReviewItem[]> {
  const { data, error } = await supabase.rpc('meli_admin_get_pending_reviews', {
    p_passcode: requireOpsPasscode(),
  });
  if (error) throw error;
  return ((data as Record<string, unknown>[]) || []).map(parsePendingReview);
}

export async function adminReviewStage(
  responseId: string,
  sectionId: string,
  action: 'aprobar' | 'rechazar' | 'en_revision',
  reviewedBy = 'Ops',
  rejectionMessage?: string,
  reviewFlags?: ReviewFlagsMap
): Promise<SurveyResponse> {
  const { data, error } = await supabase.rpc('meli_admin_review_stage', {
    p_passcode: requireOpsPasscode(),
    p_response_id: responseId,
    p_section_id: sectionId,
    p_action: action,
    p_reviewed_by: reviewedBy,
    p_rejection_message: rejectionMessage?.trim() || null,
    p_review_flags: reviewFlags && Object.keys(reviewFlags).length > 0 ? reviewFlags : null,
  });
  if (error) throw error;
  return parseResponse(data as Record<string, unknown>);
}

/** Mergea respuestas editadas por el admin sin cambiar stages ni status */
export async function adminUpdateAnswers(
  responseId: string,
  answers: Record<string, AnswerValue>
): Promise<SurveyResponse> {
  const { data, error } = await supabase.rpc('meli_admin_update_answers', {
    p_passcode: requireOpsPasscode(),
    p_response_id: responseId,
    p_answers: answers,
  });
  if (error) throw error;
  return parseResponse(data as Record<string, unknown>);
}

export async function adminDeletePostulante(responseId: string): Promise<void> {
  const { error } = await supabase.rpc('meli_admin_delete_postulante', {
    p_passcode: requireOpsPasscode(),
    p_response_id: responseId,
  });
  if (error) throw error;
}

/** Actualiza nombre/apellido y reclutador sin tocar país, idioma ni is_prueba */
export async function adminUpdatePostulante(
  responseId: string,
  nombreApellido: string,
  reclutador?: string
): Promise<SurveyResponse> {
  const { data, error } = await supabase.rpc('meli_admin_update_postulante', {
    p_passcode: requireOpsPasscode(),
    p_response_id: responseId,
    p_nombre_apellido: nombreApellido,
    p_reclutador: reclutador?.trim() || null,
  });
  if (error) throw error;
  return parseResponse(data as Record<string, unknown>);
}

/** Quita marcas de cierre para que el postulante pueda editar de nuevo */
export async function adminUnlockSurvey(responseId: string): Promise<SurveyResponse> {
  const { data, error } = await supabase.rpc('meli_admin_unlock_survey', {
    p_passcode: requireOpsPasscode(),
    p_response_id: responseId,
  });
  if (error) throw error;
  return parseResponse(data as Record<string, unknown>);
}

// Compatibilidad con páginas que aún usan helpers legacy
export async function getResponses(): Promise<SurveyResponse[]> {
  return adminGetResponses();
}

export async function getResponsesByStatus(
  status: ResponseStatus
): Promise<SurveyResponse[]> {
  const all = await adminGetResponses();
  return all.filter((r) => r.status === status);
}

export async function getResponseById(id: string): Promise<SurveyResponse | null> {
  const all = await adminGetResponses();
  return all.find((r) => r.id === id) ?? null;
}

// --- Storage / Evidencia --------------------------------------------------

const TUS_THRESHOLD = 6 * 1024 * 1024; // 6 MB → subida resumible

// Sube un archivo al bucket evidencia (estándar o resumible según tamaño)
export async function uploadEvidence(
  responseId: string,
  questionId: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<EvidenceFile> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const path = `${responseId}/${questionId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${ext}`;

  if (file.size >= TUS_THRESHOLD) {
    return uploadEvidenceResumable(path, file, onProgress);
  }

  const { error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw error;

  const { data } = supabase.storage.from(EVIDENCE_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, name: file.name, type: file.type };
}

// Subida resumible (TUS) para archivos grandes
async function uploadEvidenceResumable(
  path: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<EvidenceFile> {
  const { Upload } = await import('tus-js-client');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return new Promise((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000],
      headers: {
        authorization: `Bearer ${supabaseAnonKey}`,
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: EVIDENCE_BUCKET,
        objectName: path,
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024,
      onError: (error) => reject(error),
      onProgress: (bytesUploaded, bytesTotal) => {
        if (onProgress && bytesTotal > 0) {
          onProgress(Math.round((bytesUploaded / bytesTotal) * 100));
        }
      },
      onSuccess: () => {
        const { data } = supabase.storage.from(EVIDENCE_BUCKET).getPublicUrl(path);
        resolve({ url: data.publicUrl, name: file.name, type: file.type });
      },
    });
    upload.findPreviousUploads().then((previous) => {
      if (previous.length > 0) {
        upload.resumeFromPreviousUpload(previous[0]);
      }
      upload.start();
    });
  });
}

// Expone passcode para componentes que lo necesiten en login
export { getOpsPasscode };
