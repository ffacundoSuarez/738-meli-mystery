'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { adminGetResponses } from '@/lib/data';
import { exportReviewToCsv, exportReviewToExcel } from '@/lib/export';
import { REVIEWABLE_SECTIONS } from '@/lib/survey-config';
import { PAISES } from '@/lib/survey-config/constants';
import { getScreeningSnapshot } from '@/lib/survey-snapshot';
import { StageStatus, SurveyResponse } from '@/lib/types';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/** Estados seleccionables en la descarga (incluye borradores) */
export type DownloadEstado =
  | 'aprobada'
  | 'en_revision'
  | 'rechazada'
  | 'borrador';

const ESTADO_OPTIONS: { value: DownloadEstado; label: string }[] = [
  { value: 'aprobada', label: 'Aprobadas' },
  { value: 'en_revision', label: 'En revisión' },
  { value: 'rechazada', label: 'Rechazadas' },
  { value: 'borrador', label: 'Borradores / pendientes' },
];

const ALL_ESTADOS = ESTADO_OPTIONS.map((o) => o.value);
const ALL_PAIS_CODES = PAISES.map((p) => p.value);

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Respuestas del listado (summary) para armar opciones de empresa */
  responses: SurveyResponse[];
};

/** Alterna un valor en un array de selección (checkbox multi) */
function toggleValue<T extends string>(list: T[], value: T, checked: boolean): T[] {
  if (checked) return list.includes(value) ? list : [...list, value];
  return list.filter((v) => v !== value);
}

/**
 * Diálogo de descarga de bases desde Revisión.
 * Permite elegir formato, países, empresas y estados (incluye parciales/borradores).
 */
export function RevisionDownloadDialog({ open, onOpenChange, responses }: Props) {
  const [format, setFormat] = useState<'excel' | 'csv'>('excel');
  const [paises, setPaises] = useState<string[]>(ALL_PAIS_CODES);
  const [empresas, setEmpresas] = useState<string[]>([]);
  const [estados, setEstados] = useState<DownloadEstado[]>(ALL_ESTADOS);
  const [exporting, setExporting] = useState(false);

  /** Empresas presentes en los datos cargados (marca del screening) */
  const empresaOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of responses) {
      const marca = getScreeningSnapshot(r.answers).marca;
      if (marca) set.add(marca);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [responses]);

  // Al abrir (o cuando cambian las empresas disponibles), seleccionar todas por defecto
  useEffect(() => {
    if (open) {
      setEmpresas(empresaOptions);
      setPaises(ALL_PAIS_CODES);
      setEstados(ALL_ESTADOS);
      setFormat('excel');
    }
  }, [open, empresaOptions]);

  const handleDownload = async () => {
    if (paises.length === 0) {
      toast.error('Seleccioná al menos un país');
      return;
    }
    if (empresas.length === 0) {
      toast.error('Seleccioná al menos una empresa');
      return;
    }
    if (estados.length === 0) {
      toast.error('Seleccioná al menos un estado');
      return;
    }

    setExporting(true);
    try {
      const all = await adminGetResponses();
      const rows = all.filter((r) => {
        const snap = getScreeningSnapshot(r.answers);
        const stageStatuses = REVIEWABLE_SECTIONS.map(
          (id) => r.stages?.[id]?.status as StageStatus | undefined
        ).filter(Boolean) as StageStatus[];

        const matchesPais =
          paises.length === 0 ||
          (Boolean(snap.paisCode) && paises.includes(snap.paisCode!));
        const matchesEmpresa =
          empresas.length === 0 ||
          (Boolean(snap.marca) && empresas.includes(snap.marca!));

        // Borrador: todas las etapas inexistentes o pendientes
        const isBorrador =
          stageStatuses.length === 0 ||
          stageStatuses.every((s) => s === 'pendiente');

        const matchesEstado = estados.some((e) =>
          e === 'borrador'
            ? isBorrador
            : stageStatuses.includes(e as StageStatus)
        );

        return matchesPais && matchesEmpresa && matchesEstado;
      });

      if (rows.length === 0) {
        toast.error('No hay respuestas con los filtros seleccionados');
        return;
      }

      const stamp = new Date().toISOString().slice(0, 10);
      if (format === 'excel') {
        await exportReviewToExcel(rows, `meli-revision-${stamp}.xlsx`);
      } else {
        exportReviewToCsv(rows, `meli-revision-${stamp}.csv`);
      }
      toast.success(`Descargadas ${rows.length} respuesta${rows.length !== 1 ? 's' : ''}`);
      onOpenChange(false);
    } catch {
      toast.error('Error al exportar');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Descargar base</DialogTitle>
          <DialogDescription>
            Se exporta lo respondido hasta el momento (celdas vacías donde aún no
            contestaron).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Formato */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Formato</Label>
            <RadioGroup
              value={format}
              onValueChange={(v) => setFormat(v as 'excel' | 'csv')}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="excel" id="fmt-excel" />
                <Label htmlFor="fmt-excel" className="font-normal cursor-pointer">
                  Excel (.xlsx)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="csv" id="fmt-csv" />
                <Label htmlFor="fmt-csv" className="font-normal cursor-pointer">
                  CSV
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Países */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Países</Label>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() =>
                  setPaises(
                    paises.length === ALL_PAIS_CODES.length ? [] : ALL_PAIS_CODES
                  )
                }
              >
                {paises.length === ALL_PAIS_CODES.length
                  ? 'Ninguno'
                  : 'Todos'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PAISES.map((p) => (
                <label
                  key={p.value}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={paises.includes(p.value)}
                    onCheckedChange={(checked) =>
                      setPaises(toggleValue(paises, p.value, Boolean(checked)))
                    }
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>

          {/* Empresas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Empresas</Label>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() =>
                  setEmpresas(
                    empresas.length === empresaOptions.length
                      ? []
                      : empresaOptions
                  )
                }
              >
                {empresas.length === empresaOptions.length &&
                empresaOptions.length > 0
                  ? 'Ninguna'
                  : 'Todas'}
              </button>
            </div>
            {empresaOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay empresas en los datos cargados.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                {empresaOptions.map((marca) => (
                  <label
                    key={marca}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={empresas.includes(marca)}
                      onCheckedChange={(checked) =>
                        setEmpresas(
                          toggleValue(empresas, marca, Boolean(checked))
                        )
                      }
                    />
                    {marca}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Estados */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Estados</Label>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() =>
                  setEstados(
                    estados.length === ALL_ESTADOS.length ? [] : ALL_ESTADOS
                  )
                }
              >
                {estados.length === ALL_ESTADOS.length ? 'Ninguno' : 'Todos'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ESTADO_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={estados.includes(o.value)}
                    onCheckedChange={(checked) =>
                      setEstados(
                        toggleValue(estados, o.value, Boolean(checked))
                      )
                    }
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={exporting}
          >
            Cancelar
          </Button>
          <Button onClick={handleDownload} disabled={exporting}>
            {exporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Descargar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
