'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  surveySections,
  getResumeSectionIndex,
  getSectionTitle,
  getNextReviewableSection,
  getSectionModules,
  isLastVisibleModule,
  isReviewableSection,
  locateQuestion,
  getOrderedReviewQuestionIds,
  getLocalizedSectionTitle,
  allStagesApproved,
} from '@/lib/survey-config';
import {
  getDisqualification,
  getPartAnswers,
  getProgressiveQuestions,
  isModuleComplete,
  partHasAnswers,
} from '@/lib/survey-logic';
import { formatQuestionText, pick } from '@/lib/format';
import { t } from '@/lib/survey-i18n';
import { AnswerValue, EvidenceFile, Lang, Question, ReviewFlagsMap, StageStatus, StagesMap, SurveyModule } from '@/lib/types';
import { getResponseByToken, saveStageByToken, uploadEvidence } from '@/lib/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { QuestionInput } from '@/components/survey/QuestionInput';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
  Eye,
  Clock,
  AlertCircle,
  Lock,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const STAGE_STATUS_TEXT: Record<StageStatus, Record<Lang, string>> = {
  pendiente: { es: 'pendiente', pt: 'pendente' },
  en_revision: { es: 'en revisión', pt: 'em revisão' },
  aprobada: { es: 'aprobada', pt: 'aprovada' },
  rechazada: { es: 'rechazada', pt: 'rejeitada' },
};

function sectionAnswersEqual(
  a: Record<string, AnswerValue>,
  b: Record<string, AnswerValue>
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Serializa una respuesta para comparar cambios en modo corrección */
function serializeAnswer(value: AnswerValue | undefined): string {
  return JSON.stringify(value ?? null);
}

/** Baseline inicial de las preguntas marcadas a revisar */
function buildCorrectionBaseline(
  questionIds: string[],
  source: Record<string, AnswerValue>
): Record<string, string> {
  const baseline: Record<string, string> = {};
  for (const qId of questionIds) {
    baseline[qId] = serializeAnswer(source[qId]);
  }
  return baseline;
}

export function SurveyForm({ accessToken }: { accessToken: string }) {
  const [currentSection, setCurrentSection] = useState(0);
  const [currentModuleIndex, setCurrentModuleIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [stages, setStages] = useState<StagesMap>({});
  const [code, setCode] = useState('');
  const [responseId, setResponseId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showStageGate, setShowStageGate] = useState(false);
  const [surveyThankYou, setSurveyThankYou] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [sectionBaseline, setSectionBaseline] = useState<Record<string, AnswerValue>>({});
  const [lang, setLang] = useState<Lang>('es');
  const [reviewFlags, setReviewFlags] = useState<ReviewFlagsMap>({});
  const [reviewNavIndex, setReviewNavIndex] = useState(0);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [correctionBaseline, setCorrectionBaseline] = useState<Record<string, string>>({});
  const correctionJumpRef = useRef(false);

  const isFinalized = answers['proceso-finalizado'] === 'si';
  const section = surveySections[currentSection];
  const sectionId = section.id;
  const isReviewable = isReviewableSection(sectionId);
  const currentStageStatus = stages[sectionId]?.status as StageStatus | undefined;

  const orderedReviewIds = useMemo(
    () => getOrderedReviewQuestionIds(reviewFlags),
    [reviewFlags]
  );

  const hasActiveCorrections = orderedReviewIds.length > 0;

  const correctionsModifiedCount = useMemo(() => {
    if (!hasActiveCorrections) return 0;
    return orderedReviewIds.filter(
      (qId) => serializeAnswer(answers[qId]) !== correctionBaseline[qId]
    ).length;
  }, [answers, correctionBaseline, orderedReviewIds, hasActiveCorrections]);

  const allCorrectionsModified =
    hasActiveCorrections &&
    orderedReviewIds.length > 0 &&
    correctionsModifiedCount === orderedReviewIds.length;

  const visibleModules = useMemo(
    () => getSectionModules(section, answers),
    [section, answers]
  );

  const currentModule: SurveyModule | undefined =
    visibleModules[currentModuleIndex] ?? visibleModules[0];

  const moduleProgress = useMemo(() => {
    if (visibleModules.length === 0) return 0;
    return ((currentModuleIndex + 1) / visibleModules.length) * 100;
  }, [currentModuleIndex, visibleModules.length]);

  const totalSections = surveySections.length;

  const nextSectionTitle = useMemo(() => {
    const nextId = getNextReviewableSection(sectionId);
    return nextId ? getLocalizedSectionTitle(nextId, lang) : null;
  }, [sectionId, lang]);

  const nextSectionIndex = useMemo(() => {
    const nextId = getNextReviewableSection(sectionId);
    if (!nextId) return null;
    return surveySections.findIndex((s) => s.id === nextId);
  }, [sectionId]);

  const getSectionAnswers = useCallback(
    (secId: string, source: Record<string, AnswerValue> = answers) => {
      const sec = surveySections.find((s) => s.id === secId);
      if (!sec) return {};
      return getPartAnswers(sec, source);
    },
    [answers]
  );

  const hasSectionEdits = useMemo(() => {
    return !sectionAnswersEqual(getSectionAnswers(sectionId), sectionBaseline);
  }, [answers, sectionBaseline, sectionId, getSectionAnswers]);

  const currentModuleComplete = useMemo(() => {
    if (!currentModule) return false;
    return isModuleComplete(currentModule, answers);
  }, [answers, currentModule]);

  const shouldSubmitForReview = useMemo(() => {
    if (!isReviewable) return false;
    if (!partHasAnswers(section, answers)) return false;
    if (!currentStageStatus || currentStageStatus === 'pendiente') return true;
    if (currentStageStatus === 'rechazada') return hasSectionEdits;
    return hasSectionEdits;
  }, [isReviewable, section, answers, currentStageStatus, hasSectionEdits]);

  const showStatusBanner =
    isReviewable && currentStageStatus && currentStageStatus !== 'pendiente';

  /** Viendo respuestas de una parte ya enviada/aprobada (sin modo corrección) */
  const isBrowsingApprovedSection =
    !showStageGate &&
    isReviewable &&
    (currentStageStatus === 'aprobada' || currentStageStatus === 'en_revision') &&
    !correctionMode;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const existing = await getResponseByToken(accessToken);
        if (!active) return;
        if (existing) {
          const ans = existing.answers || {};
          const flags = existing.reviewFlags || {};
          setAnswers(ans);
          setStages(existing.stages || {});
          setReviewFlags(flags);
          setResponseId(existing.id);
          setCode(existing.code || '');
          setLang(existing.idioma || 'es');

          const reviewIds = getOrderedReviewQuestionIds(flags);
          if (reviewIds.length > 0) {
            const loc = locateQuestion(reviewIds[0], ans);
            if (loc) {
              correctionJumpRef.current = true;
              setCorrectionBaseline(buildCorrectionBaseline(reviewIds, ans));
              setCurrentSection(loc.sectionIndex);
              setCurrentModuleIndex(loc.moduleIndex);
              setReviewNavIndex(0);
              setCorrectionMode(true);
              setShowStageGate(false);
            }
          } else {
            setCurrentSection(getResumeSectionIndex(existing.stages || {}));
          }

          // Cerrada manualmente o con las tres partes aprobadas => cartel de gracias
          if (ans['encuesta-cerrada'] === 'si' || allStagesApproved(existing.stages || {})) {
            setSurveyThankYou(true);
          }
        }
      } catch {
        toast.error(t('loadError', 'es'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(() => {
    if (loading) return;
    if (correctionJumpRef.current) {
      correctionJumpRef.current = false;
    } else {
      setCurrentModuleIndex(0);
    }
    setSectionBaseline(getSectionAnswers(sectionId, answers));
    if (isReviewable) {
      const status = stages[sectionId]?.status;
      if (correctionMode && hasActiveCorrections) {
        setShowStageGate(false);
      } else {
        setShowStageGate(status === 'aprobada' || status === 'en_revision');
      }
    } else {
      setShowStageGate(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSection, loading]);

  const updateAnswer = (questionId: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleEvidenceUpload = async (questionId: string, files: FileList | null) => {
    if (isFinalized || surveyThankYou) return;
    if (!files || files.length === 0) return;
    if (!responseId) {
      toast.error(t('loadError', lang));
      return;
    }
    setUploading((p) => ({ ...p, [questionId]: true }));
    try {
      const uploaded: EvidenceFile[] = [];
      for (const file of Array.from(files)) {
        uploaded.push(
          await uploadEvidence(responseId, questionId, file, (pct) =>
            setUploadProgress((p) => ({ ...p, [questionId]: pct }))
          )
        );
      }
      const current = (answers[questionId] as EvidenceFile[]) || [];
      updateAnswer(questionId, [...current, ...uploaded]);
      toast.success(t('fileSent', lang));
    } catch {
      toast.error(t('fileError', lang));
    } finally {
      setUploading((p) => ({ ...p, [questionId]: false }));
      setUploadProgress((p) => ({ ...p, [questionId]: 0 }));
    }
  };

  const removeEvidence = (questionId: string, url: string) => {
    const current = (answers[questionId] as EvidenceFile[]) || [];
    updateAnswer(questionId, current.filter((f) => f.url !== url));
  };

  const advanceToNextModule = () => {
    if (currentModuleIndex < visibleModules.length - 1) {
      setCurrentModuleIndex((i) => i + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return true;
    }
    return false;
  };

  const advanceToNextSection = () => {
    if (currentSection < totalSections - 1) {
      setCurrentSection((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const saveCurrentSection = async (advance: boolean, submitReview: boolean) => {
    if (isFinalized || surveyThankYou) return;
    setSaving(true);
    try {
      const sectionAnswers = getSectionAnswers(sectionId);
      const updated = await saveStageByToken(
        accessToken,
        sectionId,
        sectionAnswers,
        submitReview
      );
      setStages(updated.stages || {});
      setAnswers(updated.answers || {});
      setReviewFlags(updated.reviewFlags || {});
      setSectionBaseline(getSectionAnswers(sectionId, updated.answers || {}));

      if (submitReview && isReviewable) {
        toast.success(`"${pick(section.title, section.titlePt, lang)}" ${t('sentReview', lang)}`);
        if (Object.keys(updated.reviewFlags || {}).length === 0) {
          setCorrectionMode(false);
        }
        setShowStageGate(true);
        return;
      }

      if (advance) advanceToNextSection();
    } catch {
      toast.error(t('saveError', lang));
    } finally {
      setSaving(false);
    }
  };

  const handleSurveyThankYou = async () => {
    setSaving(true);
    try {
      const sectionAnswers = {
        ...getSectionAnswers(sectionId),
        'encuesta-cerrada': 'si',
      };
      const updated = await saveStageByToken(
        accessToken,
        sectionId,
        sectionAnswers,
        false
      );
      setAnswers(updated.answers || {});
      setSurveyThankYou(true);
    } catch {
      toast.error(t('saveError', lang));
    } finally {
      setSaving(false);
    }
  };

  const goToNext = async () => {
    if (!currentModuleComplete) return;

    const dq = getDisqualification(surveySections, answers);
    if (dq.terminated) {
      await handleSurveyThankYou();
      return;
    }

    const lastModule = isLastVisibleModule(section, currentModuleIndex, answers);

    if (!lastModule) {
      setSaving(true);
      try {
        const sectionAnswers = getSectionAnswers(sectionId);
        const updated = await saveStageByToken(
          accessToken,
          sectionId,
          sectionAnswers,
          false
        );
        setStages(updated.stages || {});
        setAnswers(updated.answers || {});
        advanceToNextModule();
      } catch {
        toast.error(t('saveError', lang));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (shouldSubmitForReview) {
      await saveCurrentSection(false, true);
      return;
    }

    // En modo "ver respuestas", volver al resumen de la parte
    if (isBrowsingApprovedSection) {
      setShowStageGate(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Último módulo: mostrar pantalla de estado/revisión, nunca saltar a la siguiente parte
    setShowStageGate(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToPrevious = () => {
    if (currentModuleIndex > 0) {
      setCurrentModuleIndex((i) => i - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (currentSection > 0) {
      setCurrentSection((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goToNextStage = () => {
    if (nextSectionIndex !== null) {
      setCurrentSection(nextSectionIndex);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const openResponsesForEdit = () => setShowStageGate(false);

  /** Solo permite ir a secciones ya iniciadas; la siguiente parte solo vía el banner */
  const canNavigateToSection = (index: number) => {
    if (index === currentSection) return true;
    const targetId = surveySections[index].id;
    const targetStatus = stages[targetId]?.status;
    if (targetStatus && targetStatus !== 'pendiente') return true;
    if (index > currentSection) return false;
    return true;
  };

  const goToReviewQuestion = (index: number) => {
    const qId = orderedReviewIds[index];
    if (!qId) return;
    const loc = locateQuestion(qId, answers);
    if (!loc) return;
    correctionJumpRef.current = true;
    setReviewNavIndex(index);
    setCurrentSection(loc.sectionIndex);
    setCurrentModuleIndex(loc.moduleIndex);
    setCorrectionMode(true);
    setShowStageGate(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /** Reenvía a revisión todas las partes con correcciones modificadas */
  const submitAllCorrections = async () => {
    if (!allCorrectionsModified || saving) return;
    setSaving(true);
    try {
      const sectionIds = [
        ...new Set(
          orderedReviewIds
            .map((qId) => reviewFlags[qId]?.sectionId)
            .filter((id): id is string => Boolean(id))
        ),
      ];

      let updated;
      for (const secId of sectionIds) {
        updated = await saveStageByToken(
          accessToken,
          secId,
          getSectionAnswers(secId),
          true
        );
      }

      if (updated) {
        setStages(updated.stages || {});
        setAnswers(updated.answers || {});
        setReviewFlags(updated.reviewFlags || {});
        setCorrectionBaseline({});
        setCorrectionMode(false);
        setShowStageGate(true);
        toast.success(t('correctionsSent', lang));
      }
    } catch {
      toast.error(t('saveError', lang));
    } finally {
      setSaving(false);
    }
  };

  const renderQuestion = (question: Question) => {
    const displayText = formatQuestionText(pick(question.text, question.textPt, lang));
    const flag = reviewFlags[question.id];
    const reviewNote = flag?.corrected ? undefined : flag?.note;
    const hasReviewFlag = Boolean(reviewNote);

    return (
      <div
        key={question.id}
        className={cn(
          'space-y-3',
          hasReviewFlag &&
            'rounded-xl border-2 border-amber-300 bg-amber-50/40 p-4 shadow-sm'
        )}
      >
        <Label className="text-base font-medium leading-relaxed">
          {displayText}
          {question.required && <span className="text-red-500 ml-1">*</span>}
        </Label>

        {reviewNote && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
            <p className="font-medium text-blue-900 mb-1 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {t('reviewNote', lang)}
            </p>
            <p className="text-blue-900/90 whitespace-pre-wrap">{reviewNote}</p>
          </div>
        )}

        {question.hint && question.type !== 'info' && (
          <p className="text-sm text-muted-foreground">
            {pick(question.hint, question.hintPt, lang)}
          </p>
        )}

        <QuestionInput
          question={question}
          value={answers[question.id]}
          answers={answers}
          onChange={updateAnswer}
          lang={lang}
          optionSeed={accessToken}
          uploading={uploading[question.id]}
          uploadProgress={uploadProgress[question.id]}
          onUploadEvidence={handleEvidenceUpload}
          onRemoveEvidence={removeEvidence}
        />
      </div>
    );
  };

  const renderThankYouScreen = () => (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-0 shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
          </div>
          <CardTitle className="text-2xl">{t('thankYouTitle', lang)}</CardTitle>
          <CardDescription className="text-base">{t('thankYouDesc', lang)}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );

  const renderFinalizedScreen = () => {
    const fechaFin = (answers['fecha-fin'] as string) || '';
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-0 shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Lock className="w-6 h-6 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl">{t('processClosed', lang)}</CardTitle>
            <CardDescription className="text-base">{t('processClosedDesc', lang)}</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-2 pb-8">
            {code && (
              <p className="text-sm text-muted-foreground">
                {t('code', lang)}: <span className="font-mono font-medium text-foreground">{code}</span>
              </p>
            )}
            {fechaFin && (
              <p className="text-sm">
                {t('endDate', lang)}:{' '}
                <span className="font-medium">
                  {new Date(fechaFin + 'T12:00:00').toLocaleDateString('es-AR')}
                </span>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderStageGateBanner = () => {
    if (!showStatusBanner || !currentStageStatus) return null;

    const statusStyles = {
      aprobada: 'bg-green-50 text-green-800 border-green-200',
      en_revision: 'bg-amber-50 text-amber-800 border-amber-200',
      rechazada: 'bg-red-50 text-red-800 border-red-200',
    }[currentStageStatus];

    const StatusIcon =
      currentStageStatus === 'aprobada' ? Check : currentStageStatus === 'en_revision' ? Clock : AlertCircle;

    return (
      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
        <div className={cn('text-sm rounded-lg p-4 border', statusStyles)}>
          <div className="flex items-center gap-2 font-medium mb-1">
            <StatusIcon className="w-4 h-4 shrink-0" />
            &quot;{pick(section.title, section.titlePt, lang)}&quot; {t('stageIs', lang)}{' '}
            {STAGE_STATUS_TEXT[currentStageStatus][lang]}
          </div>
          {currentStageStatus !== 'rechazada' && (
            <p className="text-sm opacity-80">{t('completeNext', lang)}</p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          {nextSectionTitle && currentStageStatus !== 'rechazada' && (
            <Button onClick={goToNextStage} className="flex-1">
              {t('startPart', lang)} {nextSectionTitle}
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
          <Button variant="outline" onClick={openResponsesForEdit} className="flex-1">
            <Eye className="w-4 h-4 mr-2" />
            {t('viewAnswers', lang)}
          </Button>
        </div>
      </div>
    );
  };

  const renderReviewNavigator = () => {
    if (!hasActiveCorrections || !correctionMode) return null;
    const current = reviewNavIndex + 1;
    const total = orderedReviewIds.length;

    return (
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-20 max-w-md w-[calc(100%-2rem)]">
        <div className="rounded-2xl border bg-background/95 backdrop-blur shadow-lg px-3 py-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled={reviewNavIndex <= 0}
              onClick={() => goToReviewQuestion(reviewNavIndex - 1)}
              title={t('prevCorrection', lang)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium text-center flex-1">
              {t('correction', lang)} {current}/{total}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled={reviewNavIndex >= total - 1}
              onClick={() => goToReviewQuestion(reviewNavIndex + 1)}
              title={t('nextCorrection', lang)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          {allCorrectionsModified ? (
            <Button
              className="w-full"
              onClick={submitAllCorrections}
              disabled={saving}
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {t('submitCorrections', lang)}
            </Button>
          ) : (
            <p className="text-xs text-center text-muted-foreground px-1">
              {t('correctionsProgress', lang)} {correctionsModifiedCount}/{total}
            </p>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Priorizar correcciones pendientes sobre pantallas de cierre
  if (surveyThankYou && !hasActiveCorrections) return renderThankYouScreen();
  if (isFinalized && !hasActiveCorrections) return renderFinalizedScreen();

  const hideForm = showStageGate && (currentStageStatus === 'aprobada' || currentStageStatus === 'en_revision');
  const showBottomNext = !hideForm;
  const isLastModule = isLastVisibleModule(section, currentModuleIndex, answers);
  const progressiveQuestions = currentModule
    ? getProgressiveQuestions(currentModule, answers)
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {renderReviewNavigator()}

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {code ? `${code} · ` : ''}
              {pick(section.title, section.titlePt, lang)}
              {currentModule && visibleModules.length > 1 && (
                <span className="text-muted-foreground font-normal">
                  {' '}
                  — {pick(currentModule.title, currentModule.titlePt, lang)}
                </span>
              )}
            </span>
            <span className="text-muted-foreground">{Math.round(moduleProgress)}%</span>
          </div>
          <Progress value={moduleProgress} className="h-2" />
        </div>
      </div>

      {(showStageGate || showStatusBanner) && renderStageGateBanner()}

      {showStatusBanner && !showStageGate && hasSectionEdits && (
        <div className="max-w-2xl mx-auto px-4 pt-2">
          <p className="text-xs text-muted-foreground">{t('modifiedResubmit', lang)}</p>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-4">
        <div className="flex justify-center gap-2 flex-wrap">
          {surveySections.map((s, index) => (
            <button
              key={s.id}
              onClick={() => canNavigateToSection(index) && setCurrentSection(index)}
              disabled={!canNavigateToSection(index)}
              className={cn(
                'w-3 h-3 rounded-full transition-all',
                !canNavigateToSection(index) && 'opacity-30 cursor-not-allowed',
                index === currentSection
                  ? 'bg-primary scale-125'
                  : stages[s.id]?.status === 'aprobada'
                  ? 'bg-green-500'
                  : stages[s.id]?.status === 'en_revision'
                  ? 'bg-amber-400'
                  : stages[s.id]?.status === 'rechazada'
                  ? 'bg-red-400'
                  : index < currentSection
                  ? 'bg-primary/50'
                  : 'bg-muted-foreground/30'
              )}
              title={pick(s.title, s.titlePt, lang)}
            />
          ))}
        </div>
      </div>

      {!hideForm && currentModule && (
        <div className="max-w-2xl mx-auto px-4 pb-32">
          <Card className="border-0 shadow-lg">
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl">
                {pick(currentModule.title, currentModule.titlePt, lang)}
              </CardTitle>
              {currentModule.description && (
                <CardDescription className="text-base whitespace-pre-wrap">
                  {pick(currentModule.description, currentModule.descriptionPt, lang)}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              {progressiveQuestions.map(renderQuestion)}
              {!currentModuleComplete && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  {t('completeAll', lang)}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {hideForm && <div className="pb-32" />}

      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t">
        <div className="max-w-2xl mx-auto px-4 py-4 flex gap-3">
          <Button
            variant="outline"
            onClick={goToPrevious}
            disabled={currentSection === 0 && currentModuleIndex === 0}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            {t('back', lang)}
          </Button>

          {showBottomNext && (
            <Button
              onClick={goToNext}
              className="flex-1"
              disabled={saving || !currentModuleComplete}
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {isLastModule && isReviewable && shouldSubmitForReview
                ? t('sendReview', lang)
                : isLastModule && isBrowsingApprovedSection
                ? t('backToSummary', lang)
                : isLastModule && currentSection === totalSections - 1
                ? shouldSubmitForReview
                  ? t('sendReview', lang)
                  : t('finish', lang)
                : t('next', lang)}
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
