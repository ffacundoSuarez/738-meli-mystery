'use client';

import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { DateTimePicker } from '@/components/survey/DateTimePicker';
import { getOrderedOptions, getVisibleMatrixRows, isTimeInRange, isDateOutsideFieldPeriod, getFieldPeriodBounds, validateTrackingHistory, isQuestionLocked } from '@/lib/survey-logic';
import {
  amountUsdPreview,
  isImplausiblyLowLocalAmount,
  monedaCodeForAmount,
  totalsMatch,
} from '@/lib/survey-config/computed';
import { pick } from '@/lib/format';
import { t } from '@/lib/survey-i18n';
import {
  AnswerValue,
  EvidenceFile,
  Lang,
  MatrixAnswer,
  Question,
} from '@/lib/types';
import { FileText, Loader2, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface QuestionInputProps {
  question: Question;
  value: AnswerValue | undefined;
  answers: Record<string, AnswerValue>;
  onChange: (questionId: string, value: AnswerValue) => void;
  lang?: Lang;
  /** Semilla estable para barajar opciones (token o id del postulante) */
  optionSeed?: string;
  uploading?: boolean;
  uploadProgress?: number;
  onUploadEvidence?: (questionId: string, files: FileList | null) => void;
  onRemoveEvidence?: (questionId: string, url: string) => void;
}

/** Renderiza el control editable según el tipo de pregunta */
export function QuestionInput({
  question,
  value,
  answers,
  onChange,
  lang = 'es',
  optionSeed = '',
  uploading = false,
  uploadProgress = 0,
  onUploadEvidence,
  onRemoveEvidence,
}: QuestionInputProps) {
  const options = useMemo(
    () => getOrderedOptions(question, answers, optionSeed),
    [question, answers, optionSeed]
  );

  const isComputed = Boolean(question.computed);
  const isLocked = isQuestionLocked(question, answers);
  const updateValue = (next: AnswerValue) => onChange(question.id, next);

  const toggleMultipleChoice = (optionValue: string) => {
    const current = (value as string[]) || [];
    const updated = current.includes(optionValue)
      ? current.filter((v) => v !== optionValue)
      : [...current, optionValue];
    updateValue(updated);
  };

  const updateMatrixCell = (rowId: string, colValue: string) => {
    const matrixVal = (value as MatrixAnswer) || {};
    if (matrixVal[rowId] === colValue) {
      const next = { ...matrixVal };
      delete next[rowId];
      updateValue(next);
    } else {
      updateValue({ ...matrixVal, [rowId]: colValue });
    }
  };

  if (question.type === 'info') {
    return question.hint ? (
      <p className="text-sm bg-muted/50 p-3 rounded-lg">
        {pick(question.hint, question.hintPt, lang)}
      </p>
    ) : null;
  }

  if (question.type === 'single' && options.length > 0) {
    const displayValue =
      isLocked && question.lockedValue !== undefined ? question.lockedValue : value;

    return (
      <div className="grid gap-2">
        {options.map((option) => {
          const selected = displayValue === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={isLocked}
              onClick={() => {
                if (!isLocked) updateValue(selected ? '' : option.value);
              }}
              className={cn(
                'flex items-center text-left w-full p-4 rounded-lg border-2 transition-all',
                isLocked
                  ? 'cursor-not-allowed opacity-70'
                  : 'cursor-pointer',
                selected
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
              )}
            >
              <span className="flex-1 text-sm">
                {pick(option.label, option.labelPt, lang)}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  if (question.type === 'multiple' && options.length > 0) {
    return (
      <div className="grid gap-2">
        {options.map((option) => {
          const isChecked = ((value as string[]) || []).includes(option.value);
          return (
            <label
              key={option.value}
              className={cn(
                'flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-all',
                isChecked
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
              )}
            >
              <Checkbox
                checked={isChecked}
                onCheckedChange={() => toggleMultipleChoice(option.value)}
              />
              <span className="flex-1 text-sm">
                {pick(option.label, option.labelPt, lang)}
              </span>
            </label>
          );
        })}
      </div>
    );
  }

  if (question.type === 'text') {
    return (
      <Input
        type="text"
        value={(value as string) || ''}
        onChange={(e) => {
          if (!isComputed) updateValue(e.target.value);
        }}
        readOnly={isComputed}
        placeholder={t('writeAnswer', lang)}
        className={isComputed ? 'bg-muted/50 text-muted-foreground' : undefined}
      />
    );
  }

  if (question.type === 'longtext') {
    const textValue = (value as string) || '';
    const trackingCheck =
      question.validate === 'trackingHistory' && textValue.trim()
        ? validateTrackingHistory(textValue)
        : null;
    const trackingMsg =
      trackingCheck &&
      trackingCheck.level !== 'ok' &&
      trackingCheck.messageKey
        ? t(trackingCheck.messageKey, lang)
        : null;

    return (
      <div className="space-y-1.5">
        <Textarea
          value={textValue}
          onChange={(e) => updateValue(e.target.value)}
          placeholder={t('writeAnswer', lang)}
          className="min-h-[100px]"
        />
        {trackingMsg && (
          <p
            className={
              trackingCheck?.level === 'error'
                ? 'text-sm text-destructive'
                : 'text-sm text-amber-600 dark:text-amber-500'
            }
          >
            {trackingMsg}
          </p>
        )}
      </div>
    );
  }

  if (question.type === 'date') {
    const dateValue = (value as string) || '';
    const outsidePeriod =
      Boolean(dateValue) && isDateOutsideFieldPeriod(dateValue, answers);
    const { start, end } = getFieldPeriodBounds(answers);

    return (
      <div className="space-y-1.5">
        <Input
          type="date"
          value={dateValue}
          onChange={(e) => updateValue(e.target.value)}
        />
        {outsidePeriod && (
          <p className="text-sm text-amber-600 dark:text-amber-500">
            {t('dateOutsideFieldPeriod', lang)
              .replace('{start}', start ?? '—')
              .replace('{end}', end ?? '—')}
          </p>
        )}
      </div>
    );
  }

  if (question.type === 'time') {
    const timeValue = (value as string) || '';
    const outOfRange =
      Boolean(timeValue) &&
      (question.minTime || question.maxTime) &&
      !isTimeInRange(timeValue, question.minTime, question.maxTime);

    return (
      <div className="space-y-1.5">
        <Input
          type="time"
          value={timeValue}
          min={question.minTime}
          max={question.maxTime}
          onChange={(e) => updateValue(e.target.value)}
        />
        {outOfRange && (
          <p className="text-sm text-destructive">
            {t('timeOutOfRange', lang)
              .replace('{min}', question.minTime ?? '')
              .replace('{max}', question.maxTime ?? '')}
          </p>
        )}
      </div>
    );
  }

  if (question.type === 'datetime') {
    return (
      <DateTimePicker
        value={(value as string) || ''}
        onChange={(v) => updateValue(v)}
      />
    );
  }

  if (question.type === 'number') {
    const monedaCode = monedaCodeForAmount(question.id, answers);
    const preview =
      !isComputed && monedaCode
        ? amountUsdPreview(value, monedaCode)
        : null;
    const tooLow =
      !isComputed &&
      isImplausiblyLowLocalAmount(question.id, value, monedaCode);
    const showTotalsWarn =
      question.id === 'q46c-precio-final' && totalsMatch(answers) === false;

    return (
      <div className="space-y-1.5">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          value={(value as string) || ''}
          onChange={(e) => {
            if (!isComputed) updateValue(e.target.value);
          }}
          readOnly={isComputed}
          placeholder={t('writeAnswer', lang)}
          className={isComputed ? 'bg-muted/50 text-muted-foreground' : undefined}
        />
        {preview && (
          <p className="text-sm text-muted-foreground">
            {t('amountUsdPreview', lang)
              .replace('{amount}', String(preview.amount))
              .replace('{moneda}', preview.moneda)
              .replace('{usd}', preview.usd.toFixed(2))}
          </p>
        )}
        {tooLow && (
          <p className="text-sm text-amber-600 dark:text-amber-500">
            {t('amountTooLow', lang)}
          </p>
        )}
        {showTotalsWarn && (
          <p className="text-sm text-amber-600 dark:text-amber-500">
            {t('totalsMismatch', lang)}
          </p>
        )}
      </div>
    );
  }

  if (question.type === 'scale') {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">
          {pick(
            question.scaleMinLabel || String(question.scaleMin),
            question.scaleMinLabelPt,
            lang
          )}
        </span>
        {/* ?? y no ||: una escala que arranca en 0 (p. ej. NPS 0-10) es válida
            y 0 es falsy, así que || la desplazaría a 1. */}
        <div className="flex gap-1 flex-1 justify-center flex-wrap">
          {Array.from(
            { length: (question.scaleMax ?? 5) - (question.scaleMin ?? 1) + 1 },
            (_, i) => {
              const scaleValue = String((question.scaleMin ?? 1) + i);
              return (
                <button
                  key={scaleValue}
                  type="button"
                  onClick={() =>
                    updateValue(value === scaleValue ? '' : scaleValue)
                  }
                  className={cn(
                    'w-9 h-9 rounded-full border-2 text-sm font-medium transition-all',
                    value === scaleValue
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  {scaleValue}
                </button>
              );
            }
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {pick(
            question.scaleMaxLabel || String(question.scaleMax),
            question.scaleMaxLabelPt,
            lang
          )}
        </span>
      </div>
    );
  }

  if (question.type === 'matrix') {
    const rows = getVisibleMatrixRows(question, answers);
    const cols = question.matrixColumns ?? question.options ?? [];
    const matrixVal = (value as MatrixAnswer) || {};

    return (
      <div className="space-y-3 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left p-2 border-b" />
              {cols.map((col) => (
                <th key={col.value} className="text-center p-2 border-b font-medium">
                  {pick(col.label, col.labelPt, lang)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="p-2 align-top text-muted-foreground">
                  {pick(row.label, row.labelPt, lang)}
                </td>
                {cols.map((col) => (
                  <td key={col.value} className="p-2 text-center">
                    <input
                      type="radio"
                      name={`${question.id}-${row.id}`}
                      checked={matrixVal[row.id] === col.value}
                      onClick={() => updateMatrixCell(row.id, col.value)}
                      onChange={() => updateMatrixCell(row.id, col.value)}
                      className="w-4 h-4 accent-primary cursor-pointer"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (question.type === 'evidence') {
    const files = (value as EvidenceFile[]) || [];
    return (
      <div className="space-y-3">
        {onUploadEvidence && (
          <label className="block border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer">
            <input
              type="file"
              className="hidden"
              multiple
              onChange={(e) => onUploadEvidence(question.id, e.target.files)}
              disabled={uploading}
            />
            {uploading ? (
              <Loader2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground animate-spin" />
            ) : (
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            )}
            <p className="text-sm text-muted-foreground">
              {uploading
                ? `${t('uploading', lang)} ${uploadProgress}%`
                : t('uploadFiles', lang)}
            </p>
            {uploading && uploadProgress > 0 && (
              <Progress value={uploadProgress} className="mt-3 h-2" />
            )}
          </label>
        )}
        <div className="grid gap-2">
          {files.map((file) => (
            <div
              key={file.url}
              className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
            >
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0 space-y-1">
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm truncate hover:underline"
                >
                  {file.name}
                </a>
                {file.validation?.status === 'invalid' && (
                  <p className="text-xs text-destructive">
                    {file.validation.reason || t('evidenceInvalid', lang)}
                  </p>
                )}
                {file.validation?.status === 'doubt' && (
                  <p className="text-xs text-amber-600 dark:text-amber-500">
                    {file.validation.reason || t('evidenceDoubt', lang)}
                  </p>
                )}
                {file.validation?.status === 'ok' && (
                  <p className="text-xs text-green-700 dark:text-green-500">
                    Evidencia OK
                  </p>
                )}
              </div>
              {onRemoveEvidence && (
                <button
                  type="button"
                  onClick={() => onRemoveEvidence(question.id, file.url)}
                  className="text-muted-foreground hover:text-red-500"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
