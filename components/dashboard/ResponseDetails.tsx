'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { QuestionInput } from '@/components/survey/QuestionInput';
import {
  REVIEWABLE_SECTIONS,
  surveySections,
  getSectionTitle,
  getModuleTitle,
  getAllSectionModules,
} from '@/lib/survey-config';
import {
  getAnswerLabel,
  hasAnswerValue,
  isEvidence,
  isMatrixAnswer,
  formatQuestionText,
} from '@/lib/format';
import {
  getVisibleMatrixRows,
  getVisibleQuestions,
  isModuleVisible,
} from '@/lib/survey-logic';
import { uploadEvidence } from '@/lib/data';
import {
  AnswerValue,
  EvidenceFile,
  Lang,
  Question,
  ReviewFlagsMap,
  StageStatus,
  StagesMap,
  SurveyResponse,
} from '@/lib/types';
import {
  FileText,
  Check,
  AlertCircle,
  MoreVertical,
  Unlock,
  Loader2,
  Pencil,
  Save,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  downloadAllZip,
  downloadPartZip,
  hasAnyEvidences,
} from '@/lib/evidence-zip';

export type ResponseDetailsMode = 'revision' | 'results';

export const REVISION_STATUS_LABELS: Record<StageStatus, string> = {
  pendiente: 'Pendiente de respuesta',
  en_revision: 'Revisar',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
};

const RESULTS_STATUS_LABELS: Record<string, string> = {
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
};

export const STAGE_STATUS_COLORS: Record<string, string> = {
  pendiente: 'bg-slate-100 text-slate-600 border-slate-200',
  en_revision: 'bg-amber-50 text-amber-800 border-amber-300',
  aprobada: 'bg-green-50 text-green-700 border-green-200',
  rechazada: 'bg-red-50 text-red-700 border-red-200',
};

interface ResponseDetailsProps {
  response: SurveyResponse;
  mode?: ResponseDetailsMode;
  showStageActions?: boolean;
  allowEditAnswers?: boolean;
  onApproveStage?: (sectionId: string) => void;
  onSendCorrections?: (sectionId: string, reviewFlags: ReviewFlagsMap) => void | Promise<void>;
  /** Cambia el estado de una etapa (en_revision / aprobada / rechazada) sin exigir flags */
  onSetStageStatus?: (sectionId: string, status: StageStatus) => void | Promise<void>;
  onSaveAnswers?: (answers: Record<string, AnswerValue>) => void | Promise<void>;
  actionLoading?: string | null;
  saveLoading?: boolean;
  onUnlockSurvey?: () => void;
  unlockLoading?: boolean;
}

function renderAnswerCell(
  question: Question,
  answer: AnswerValue | undefined,
  answers: Record<string, AnswerValue>
) {
  if (question.type === 'evidence') {
    if (!answer || !isEvidence(answer)) {
      return (
        <span className="text-muted-foreground italic font-normal">Sin evidencia adjunta</span>
      );
    }
    return (
      <div className="space-y-2">
        {answer.map((file) => (
          <a
            key={file.url}
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-foreground hover:underline"
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span className="truncate font-bold">{file.name}</span>
          </a>
        ))}
      </div>
    );
  }

  if (question.type === 'matrix' && answer && isMatrixAnswer(answer)) {
    const rows = getVisibleMatrixRows(question, answers);
    const cols = question.matrixColumns ?? question.options ?? [];
    return (
      <div className="space-y-1">
        {rows
          .filter((r) => answer[r.id] !== undefined)
          .map((r) => {
            const colLabel =
              cols.find((c) => c.value === answer[r.id])?.label ?? answer[r.id];
            return (
              <div key={r.id}>
                <span className="text-muted-foreground">{r.label}: </span>
                {colLabel}
              </div>
            );
          })}
      </div>
    );
  }

  if (!hasAnswerValue(answer)) {
    return <span className="text-muted-foreground italic font-normal">Sin respuesta</span>;
  }

  return getAnswerLabel(question.id, answer as AnswerValue);
}

function stageWasSubmitted(status: StageStatus | undefined): boolean {
  return status === 'en_revision' || status === 'aprobada' || status === 'rechazada';
}

/** Calcula el diff entre respuestas editadas y las guardadas */
function getAnswersDiff(
  original: Record<string, AnswerValue>,
  edited: Record<string, AnswerValue>
): Record<string, AnswerValue> {
  const diff: Record<string, AnswerValue> = {};
  const keys = new Set([...Object.keys(original), ...Object.keys(edited)]);
  for (const key of keys) {
    if (JSON.stringify(original[key] ?? null) !== JSON.stringify(edited[key] ?? null)) {
      diff[key] = edited[key];
    }
  }
  return diff;
}

/** Abre la menor parte pendiente de revisión, o la primera disponible */
function getDefaultSectionId(stages: StagesMap, sectionIds: string[]): string {
  const pendingReview = sectionIds.find((id) => stages[id]?.status === 'en_revision');
  return pendingReview ?? sectionIds[0] ?? 'parte-1';
}

export function ResponseDetails({
  response,
  mode = 'revision',
  showStageActions = false,
  allowEditAnswers = false,
  onApproveStage,
  onSendCorrections,
  onSetStageStatus,
  onSaveAnswers,
  actionLoading,
  saveLoading = false,
  onUnlockSurvey,
  unlockLoading = false,
}: ResponseDetailsProps) {
  const [draftFlags, setDraftFlags] = useState<ReviewFlagsMap>({});
  const [editedAnswers, setEditedAnswers] = useState<Record<string, AnswerValue>>({});
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [currentSectionId, setCurrentSectionId] = useState<string>('parte-1');
  /** 'all' | sectionId mientras se genera un zip de evidencias */
  const [zipLoading, setZipLoading] = useState<string | null>(null);
  const prevResponseIdRef = useRef(response.id);

  const stages: StagesMap = response.stages || {};
  const lang: Lang = response.idioma || 'es';
  const canEdit = allowEditAnswers && mode === 'revision' && Boolean(onSaveAnswers);
  const activeAnswers = canEdit ? editedAnswers : response.answers;
  const isFinalized = response.answers['proceso-finalizado'] === 'si';
  const fechaFin =
    (response.answers['fecha-fin'] as string) || response.fechaFin || '';

  const reviewableSectionIds =
    mode === 'results'
      ? REVIEWABLE_SECTIONS.filter((id) => {
          const st = stages[id]?.status;
          return st === 'aprobada' || st === 'rechazada';
        })
      : REVIEWABLE_SECTIONS;

  useEffect(() => {
    const flags = response.reviewFlags || {};
    const active: ReviewFlagsMap = {};
    for (const [qId, flag] of Object.entries(flags)) {
      if (!flag.corrected) {
        active[qId] = flag;
      }
    }

    // Al cambiar de encuesta, resetear; si solo cambian respuestas, preservar borradores locales
    if (prevResponseIdRef.current !== response.id) {
      prevResponseIdRef.current = response.id;
      setDraftFlags(active);
    } else {
      setDraftFlags((prev) => ({ ...active, ...prev }));
    }
  }, [response.id, response.reviewFlags]);

  useEffect(() => {
    setEditedAnswers(response.answers || {});
    setEditingIds(new Set());
  }, [response.id, response.answers]);

  useEffect(() => {
    setCurrentSectionId(getDefaultSectionId(stages, reviewableSectionIds));
    // Solo al abrir otra encuesta; no resetear al guardar respuestas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response.id]);

  const answersDiff = useMemo(
    () => getAnswersDiff(response.answers || {}, editedAnswers),
    [response.answers, editedAnswers]
  );

  const hasUnsavedChanges = Object.keys(answersDiff).length > 0;
  const canDownloadAll = hasAnyEvidences(response);

  /** Descarga evidencias de una parte como .zip */
  const handleDownloadPartZip = useCallback(
    async (sectionId: string) => {
      setZipLoading(sectionId);
      try {
        await downloadPartZip(response, sectionId);
        toast.success('Evidencias descargadas');
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'No se pudo descargar el zip'
        );
      } finally {
        setZipLoading(null);
      }
    },
    [response]
  );

  /** Descarga todas las evidencias en un .zip con subcarpetas por parte */
  const handleDownloadAllZip = useCallback(async () => {
    setZipLoading('all');
    try {
      await downloadAllZip(response);
      toast.success('Todas las evidencias descargadas');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'No se pudo descargar el zip'
      );
    } finally {
      setZipLoading(null);
    }
  }, [response]);

  const updateEditedAnswer = useCallback((questionId: string, value: AnswerValue) => {
    setEditedAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const toggleEditing = (questionId: string, editing: boolean) => {
    setEditingIds((prev) => {
      const next = new Set(prev);
      if (editing) next.add(questionId);
      else next.delete(questionId);
      return next;
    });
  };

  /** Cierra edición y revierte al valor guardado en servidor */
  const cancelEditing = (questionId: string) => {
    const saved = response.answers?.[questionId];
    setEditedAnswers((prev) => {
      const next = { ...prev };
      if (saved !== undefined) next[questionId] = saved;
      else delete next[questionId];
      return next;
    });
    toggleEditing(questionId, false);
  };

  const handleEvidenceUpload = async (questionId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading((p) => ({ ...p, [questionId]: true }));
    try {
      const uploaded: EvidenceFile[] = [];
      for (const file of Array.from(files)) {
        uploaded.push(
          await uploadEvidence(response.id, questionId, file, (pct) =>
            setUploadProgress((p) => ({ ...p, [questionId]: pct }))
          )
        );
      }
      const current = (editedAnswers[questionId] as EvidenceFile[]) || [];
      updateEditedAnswer(questionId, [...current, ...uploaded]);
      toast.success('Archivo subido');
    } catch {
      toast.error('Error al subir archivo');
    } finally {
      setUploading((p) => ({ ...p, [questionId]: false }));
      setUploadProgress((p) => ({ ...p, [questionId]: 0 }));
    }
  };

  const removeEvidence = (questionId: string, url: string) => {
    const current = (editedAnswers[questionId] as EvidenceFile[]) || [];
    updateEditedAnswer(
      questionId,
      current.filter((f) => f.url !== url)
    );
  };

  const handleSaveAnswers = async () => {
    if (!onSaveAnswers || !hasUnsavedChanges) return;
    await onSaveAnswers(answersDiff);
    setEditingIds(new Set());
  };

  const toggleQuestionFlag = (questionId: string, sectionId: string, checked: boolean) => {
    setDraftFlags((prev) => {
      const next = { ...prev };
      if (checked) {
        next[questionId] = { note: prev[questionId]?.note || '', sectionId };
      } else {
        delete next[questionId];
      }
      return next;
    });
  };

  const updateQuestionNote = (questionId: string, sectionId: string, note: string) => {
    setDraftFlags((prev) => ({
      ...prev,
      [questionId]: { note, sectionId },
    }));
  };

  const getSectionDraftFlags = (sectionId: string): ReviewFlagsMap => {
    const result: ReviewFlagsMap = {};
    for (const [qId, flag] of Object.entries(draftFlags)) {
      if (flag.sectionId === sectionId && flag.note.trim()) {
        result[qId] = flag;
      }
    }
    return result;
  };

  const renderModuleBlock = (sectionId: string, moduleId: string) => {
    const section = surveySections.find((s) => s.id === sectionId);
    const module = section ? getAllSectionModules(section).find((m) => m.id === moduleId) : undefined;
    if (!module || !isModuleVisible(module, activeAnswers)) return null;

    const stageStatus = stages[sectionId]?.status;
    const canMarkReview = showStageActions && stageStatus === 'en_revision';

    const questions = getVisibleQuestions(module, activeAnswers).filter(
      (q) =>
        stageWasSubmitted(stageStatus) ||
        mode === 'results' ||
        hasAnswerValue(activeAnswers[q.id])
    );

    if (questions.length === 0) return null;

    // Botón de zip al lado del título "Evidencias" (donde está la lista de archivos)
    const evidenceQuestion = module.questions.find((q) => q.type === 'evidence');
    const evidenceAnswer = evidenceQuestion
      ? activeAnswers[evidenceQuestion.id]
      : undefined;
    const partEvidenceCount =
      evidenceAnswer && isEvidence(evidenceAnswer) ? evidenceAnswer.length : 0;

    return (
      <div key={`${sectionId}-${moduleId}`} className="space-y-3 pl-2 border-l-2 border-muted">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h5 className="font-medium text-base">{module.title}</h5>
          {partEvidenceCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 self-start sm:self-auto"
              disabled={zipLoading !== null}
              onClick={() => handleDownloadPartZip(sectionId)}
            >
              {zipLoading === sectionId ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-1" />
              )}
              Descargar evidencias (.zip)
            </Button>
          )}
        </div>
        {module.description && (
          <p className="text-sm text-muted-foreground">{module.description}</p>
        )}
        <div className="divide-y divide-border">
          {questions.map((question) => {
            const storedFlag = response.reviewFlags?.[question.id];
            const wasCorrected = storedFlag?.corrected === true;
            const isMarked = Boolean(draftFlags[question.id]);
            const note = draftFlags[question.id]?.note || '';
            const isEditing = editingIds.has(question.id);
            const questionChanged = question.id in answersDiff;
            const showEditControls = canEdit && question.type !== 'info';

            const dominantBorder =
              wasCorrected
                ? 'border-l-2 border-l-green-400 pl-3'
                : isMarked && canMarkReview
                ? 'border-l-2 border-l-amber-400 pl-3'
                : '';

            return (
              <div
                key={question.id}
                className={cn('py-4 first:pt-0 last:pb-0 space-y-2', dominantBorder)}
              >
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {formatQuestionText(question.text)}
                </p>

                {wasCorrected && storedFlag?.note && (
                  <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm space-y-1.5">
                    <Badge
                      variant="outline"
                      className="bg-green-100 text-green-800 border-green-300"
                    >
                      Marcada a revisar → Ya corregida
                    </Badge>
                    <p className="text-green-900/90 whitespace-pre-wrap">{storedFlag.note}</p>
                  </div>
                )}

                <div
                  className={cn(
                    'rounded-lg border bg-muted/40 overflow-hidden',
                    questionChanged && 'border-blue-300',
                    !questionChanged && wasCorrected && 'border-green-200',
                    !questionChanged &&
                      isMarked &&
                      canMarkReview &&
                      !wasCorrected &&
                      'border-amber-200'
                  )}
                >
                  <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60 bg-muted/20">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Respuesta
                      </span>
                      {questionChanged && (
                        <Badge
                          variant="outline"
                          className="text-[10px] py-0 h-5 bg-blue-50 text-blue-800 border-blue-200"
                        >
                          Sin guardar
                        </Badge>
                      )}
                    </div>
                    {showEditControls && (
                      <div className="flex items-center gap-1 shrink-0">
                        {isEditing ? (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => cancelEditing(question.id)}
                            >
                              Cancelar
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => toggleEditing(question.id, false)}
                            >
                              <Check className="w-3.5 h-3.5 mr-1" />
                              Listo
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => toggleEditing(question.id, true)}
                          >
                            <Pencil className="w-3.5 h-3.5 mr-1" />
                            Editar
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="p-3">
                    {isEditing ? (
                      <QuestionInput
                        question={question}
                        value={activeAnswers[question.id]}
                        answers={activeAnswers}
                        onChange={updateEditedAnswer}
                        lang={lang}
                        optionSeed={response.accessToken || response.id}
                        uploading={uploading[question.id]}
                        uploadProgress={uploadProgress[question.id]}
                        onUploadEvidence={handleEvidenceUpload}
                        onRemoveEvidence={removeEvidence}
                      />
                    ) : (
                      <div className="text-sm font-medium">
                        {renderAnswerCell(
                          question,
                          activeAnswers[question.id],
                          activeAnswers
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {canMarkReview && !wasCorrected && !isEditing && (
                  <div className="space-y-2 pt-1">
                    <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
                      <Checkbox
                        checked={isMarked}
                        onCheckedChange={(checked) =>
                          toggleQuestionFlag(question.id, sectionId, checked === true)
                        }
                      />
                      <span className="font-medium text-muted-foreground">
                        Marcar a revisar
                      </span>
                    </label>
                    <div
                      className={cn(
                        'grid transition-[grid-template-rows] duration-200 ease-out',
                        isMarked ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                      )}
                    >
                      <div className="overflow-hidden">
                        <div className="space-y-1.5 pt-1">
                          <Label
                            htmlFor={`note-${question.id}`}
                            className="text-xs text-muted-foreground"
                          >
                            Observación para el shopper
                          </Label>
                          <Textarea
                            id={`note-${question.id}`}
                            value={note}
                            onChange={(e) =>
                              updateQuestionNote(question.id, sectionId, e.target.value)
                            }
                            placeholder="Ej: Sea más explícito en la respuesta..."
                            className="min-h-[72px] text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderSectionBlock = (sectionId: string) => {
    const section = surveySections.find((s) => s.id === sectionId);
    if (!section) return null;

    const stageStatus = stages[sectionId]?.status;
    const modules = getAllSectionModules(section).filter((m) =>
      isModuleVisible(m, activeAnswers)
    );

    const hasAnswers = modules.some((m) =>
      getVisibleQuestions(m, activeAnswers).some((q) =>
        hasAnswerValue(activeAnswers[q.id])
      )
    );

    if (mode === 'results' && stageStatus !== 'aprobada' && stageStatus !== 'rechazada') {
      return null;
    }

    const statusLabel =
      mode === 'revision' && stageStatus
        ? REVISION_STATUS_LABELS[stageStatus]
        : stageStatus
        ? RESULTS_STATUS_LABELS[stageStatus] || stageStatus
        : undefined;

    const sectionFlags = getSectionDraftFlags(sectionId);
    const markedCount = Object.keys(sectionFlags).length;
    const sectionDiffKeys = Object.keys(answersDiff).filter((qId) => {
      const loc = modules.some((m) =>
        getVisibleQuestions(m, activeAnswers).some((q) => q.id === qId)
      );
      return loc;
    });
    const sectionHasChanges = sectionDiffKeys.length > 0;

    return (
      <div
        key={sectionId}
        className={cn(
          'rounded-xl border p-5 space-y-4',
          stageStatus === 'en_revision' && mode === 'revision' && 'border-amber-300 bg-amber-50/30',
          stageStatus === 'pendiente' && mode === 'revision' && 'border-dashed opacity-90'
        )}
      >
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div className="space-y-2">
            <h4 className="font-semibold text-lg">{section.title}</h4>
            {statusLabel && stageStatus && (
              <Badge variant="outline" className={cn(STAGE_STATUS_COLORS[stageStatus])}>
                {statusLabel}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-2 shrink-0 items-center">
            {canEdit && sectionHasChanges && (
              <Button
                size="sm"
                variant="outline"
                className="border-blue-400 text-blue-900 hover:bg-blue-100"
                disabled={saveLoading}
                onClick={handleSaveAnswers}
              >
                {saveLoading ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-1" />
                )}
                Guardar cambios ({sectionDiffKeys.length})
              </Button>
            )}

            {/* Selector de estado: permite reabrir aprobadas / cambiar entre estados */}
            {showStageActions &&
              onSetStageStatus &&
              stageStatus &&
              stageStatus !== 'pendiente' && (
                <Select
                  value={stageStatus}
                  disabled={actionLoading === sectionId}
                  onValueChange={(value) => {
                    if (value === stageStatus) return;
                    onSetStageStatus(sectionId, value as StageStatus);
                  }}
                >
                  <SelectTrigger className="h-8 w-[160px] text-sm">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en_revision">En revisión</SelectItem>
                    <SelectItem value="aprobada">Aprobada</SelectItem>
                    <SelectItem value="rechazada">Rechazada</SelectItem>
                  </SelectContent>
                </Select>
              )}

            {showStageActions && stageStatus === 'en_revision' && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-400 text-amber-900 hover:bg-amber-100"
                  disabled={actionLoading === sectionId || markedCount === 0}
                  onClick={() => onSendCorrections?.(sectionId, sectionFlags)}
                >
                  {actionLoading === sectionId ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <AlertCircle className="w-4 h-4 mr-1" />
                  )}
                  Enviar a corregir{markedCount > 0 ? ` (${markedCount})` : ''}
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  disabled={actionLoading === sectionId}
                  onClick={() => onApproveStage?.(sectionId)}
                >
                  <Check className="w-4 h-4 mr-1" />
                  Aprobar
                </Button>
              </>
            )}
          </div>
        </div>

        {!hasAnswers ? (
          <p className="text-sm text-muted-foreground italic">
            {mode === 'revision'
              ? 'El shopper aún no completó esta parte.'
              : 'Sin respuestas registradas.'}
          </p>
        ) : (
          <div className="space-y-5">
            {modules.map((m) => renderModuleBlock(sectionId, m.id))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!canDownloadAll || zipLoading !== null}
          onClick={handleDownloadAllZip}
        >
          {zipLoading === 'all' ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Download className="w-4 h-4 mr-1" />
          )}
          Descargar todas las evidencias (.zip)
        </Button>
      </div>

      {canEdit && hasUnsavedChanges && (
        <div className="sticky top-0 z-10 -mx-1 px-1 pb-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="rounded-xl border border-blue-300 bg-blue-50/80 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm">
            <p className="text-sm text-blue-900">
              Hay {Object.keys(answersDiff).length} respuesta
              {Object.keys(answersDiff).length !== 1 ? 's' : ''} modificada
              {Object.keys(answersDiff).length !== 1 ? 's' : ''} sin guardar.
            </p>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 shrink-0"
              disabled={saveLoading}
              onClick={handleSaveAnswers}
            >
              {saveLoading ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              Guardar todos los cambios
            </Button>
          </div>
        </div>
      )}

      {isFinalized && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-300">
              Proceso finalizado
            </Badge>
            {fechaFin && (
              <span className="text-sm text-muted-foreground">
                Fecha de término:{' '}
                <span className="font-medium text-foreground">
                  {new Date(fechaFin + 'T12:00:00').toLocaleDateString('es-AR')}
                </span>
              </span>
            )}
          </div>
          {mode === 'revision' && onUnlockSurvey && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" disabled={unlockLoading}>
                  {unlockLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onUnlockSurvey} disabled={unlockLoading}>
                  <Unlock className="w-4 h-4 mr-2" />
                  Desbloquear encuesta
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      {reviewableSectionIds.length > 1 && (
        <div className="flex justify-center gap-3 flex-wrap py-1">
          {reviewableSectionIds.map((sectionId) => {
            const status = stages[sectionId]?.status;
            const isActive = currentSectionId === sectionId;
            // Número real de la parte (1, 2, 3), no el índice de la lista filtrada
            const partNumber = REVIEWABLE_SECTIONS.indexOf(sectionId) + 1;
            return (
              <button
                key={sectionId}
                type="button"
                onClick={() => setCurrentSectionId(sectionId)}
                className={cn(
                  'w-9 h-9 rounded-full text-sm font-semibold transition-all flex items-center justify-center border-2',
                  isActive
                    ? 'bg-primary text-primary-foreground border-primary scale-110 shadow-sm'
                    : status === 'aprobada'
                    ? 'bg-green-500 text-white border-green-500'
                    : status === 'en_revision'
                    ? 'bg-amber-400 text-amber-950 border-amber-400'
                    : status === 'rechazada'
                    ? 'bg-red-400 text-white border-red-400'
                    : 'bg-muted text-muted-foreground border-muted-foreground/30'
                )}
                title={getSectionTitle(sectionId)}
              >
                {partNumber}
              </button>
            );
          })}
        </div>
      )}

      {reviewableSectionIds.length > 0 &&
        renderSectionBlock(
          reviewableSectionIds.includes(currentSectionId)
            ? currentSectionId
            : reviewableSectionIds[0]
        )}

      {mode === 'results' && reviewableSectionIds.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No hay partes aprobadas o rechazadas para mostrar.
        </p>
      )}
    </div>
  );
}

export { getSectionTitle, getModuleTitle };
