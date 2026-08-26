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
import {
  exportResponsesToCsv,
  exportResponsesToExcel,
  exportResponsesToPdf,
} from '@/lib/export';
import { CIUDADES, PAISES } from '@/lib/survey-config/constants';
import { evaluateCondition } from '@/lib/survey-logic';
import { getScreeningSnapshot } from '@/lib/survey-snapshot';
import { PublicResult, SurveyResponse } from '@/lib/types';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const ALL_PAIS_CODES = PAISES.map((p) => p.value);

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resultados públicos ya cargados */
  results: PublicResult[];
  /** Prefill desde filtros de la lista */
  initialPais?: string;
  initialCiudad?: string;
  initialEmpresa?: string;
};

function toSurveyResponse(r: PublicResult): SurveyResponse {
  return {
    id: r.id,
    code: r.code,
    nombre: r.nombre,
    apellido: r.apellido,
    nombreApellido: r.nombreApellido,
    empresa: r.empresa,
    ciudad: r.ciudad,
    status: 'publicado',
    stages: r.stages,
    answers: r.answers,
    createdAt: r.updatedAt,
    updatedAt: r.updatedAt,
  };
}

function toggleValue<T extends string>(list: T[], value: T, checked: boolean): T[] {
  if (checked) return list.includes(value) ? list : [...list, value];
  return list.filter((v) => v !== value);
}

/**
 * Diálogo de descarga desde la vista cliente (/resultados).
 * Formato + país + ciudad + marketplace.
 */
export function ClientDownloadDialog({
  open,
  onOpenChange,
  results,
  initialPais = 'all',
  initialCiudad = 'all',
  initialEmpresa = 'all',
}: Props) {
  const [format, setFormat] = useState<'excel' | 'csv' | 'pdf'>('excel');
  const [paises, setPaises] = useState<string[]>(ALL_PAIS_CODES);
  const [ciudades, setCiudades] = useState<string[]>([]);
  const [empresas, setEmpresas] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  const empresaOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of results) {
      const marca = getScreeningSnapshot(r.answers).marca;
      if (marca) set.add(marca);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [results]);

  /** Ciudades relevantes según países seleccionados (o todas). */
  const ciudadOptions = useMemo(() => {
    return CIUDADES.filter((c) => {
      if (paises.length === 0) return true;
      return paises.some((code) =>
        evaluateCondition(c.showIf, { 'f1-pais': code })
      );
    });
  }, [paises]);

  useEffect(() => {
    if (!open) return;

    setFormat('excel');

    if (initialPais !== 'all') {
      const code = PAISES.find((p) => p.label === initialPais)?.value;
      setPaises(code ? [code] : ALL_PAIS_CODES);
    } else {
      setPaises(ALL_PAIS_CODES);
    }

    setEmpresas(
      initialEmpresa !== 'all' && empresaOptions.includes(initialEmpresa)
        ? [initialEmpresa]
        : empresaOptions
    );
  }, [open, empresaOptions, initialPais, initialEmpresa]);

  // Prefill / reset ciudades cuando cambian opciones o se abre
  useEffect(() => {
    if (!open) return;
    const codes = ciudadOptions.map((c) => c.value);
    if (initialCiudad !== 'all' && codes.includes(initialCiudad)) {
      setCiudades([initialCiudad]);
    } else {
      setCiudades(codes);
    }
  }, [open, ciudadOptions, initialCiudad]);

  // Si cambia el set de países y alguna ciudad ya no aplica, limpiar
  useEffect(() => {
    const allowed = new Set(ciudadOptions.map((c) => c.value));
    setCiudades((prev) => {
      const next = prev.filter((c) => allowed.has(c));
      return next.length === prev.length ? prev : next;
    });
  }, [ciudadOptions]);

  const handleDownload = async () => {
    if (paises.length === 0) {
      toast.error('Seleccioná al menos un país');
      return;
    }
    if (ciudades.length === 0) {
      toast.error('Seleccioná al menos una ciudad');
      return;
    }
    if (empresas.length === 0) {
      toast.error('Seleccioná al menos un marketplace');
      return;
    }

    setExporting(true);
    try {
      const rows = results.filter((r) => {
        const snap = getScreeningSnapshot(r.answers);
        const matchesPais =
          Boolean(snap.paisCode) && paises.includes(snap.paisCode!);
        const cityCode =
          (r.answers?.['q10-ciudad'] as string | undefined) || undefined;
        const matchesCiudad =
          Boolean(cityCode) && ciudades.includes(cityCode!);
        const matchesEmpresa =
          Boolean(snap.marca) && empresas.includes(snap.marca!);
        return matchesPais && matchesCiudad && matchesEmpresa;
      });

      if (rows.length === 0) {
        toast.error('No hay resultados con los filtros seleccionados');
        return;
      }

      const exportRows = rows.map(toSurveyResponse);
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === 'excel') {
        await exportResponsesToExcel(exportRows, `meli-resultados-${stamp}.xlsx`);
      } else if (format === 'csv') {
        exportResponsesToCsv(exportRows, `meli-resultados-${stamp}.csv`);
      } else {
        await exportResponsesToPdf(exportRows, `meli-resultados-${stamp}.pdf`);
      }
      toast.success(
        `Descargadas ${rows.length} respuesta${rows.length !== 1 ? 's' : ''}`
      );
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
          <DialogTitle>Descargar resultados</DialogTitle>
          <DialogDescription>
            Elegí formato y filtros (país, ciudad, marketplace). Solo se incluyen
            etapas ya aprobadas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Formato</Label>
            <RadioGroup
              value={format}
              onValueChange={(v) => setFormat(v as 'excel' | 'csv' | 'pdf')}
              className="flex flex-wrap gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="excel" id="client-fmt-excel" />
                <Label htmlFor="client-fmt-excel" className="font-normal cursor-pointer">
                  Excel
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="csv" id="client-fmt-csv" />
                <Label htmlFor="client-fmt-csv" className="font-normal cursor-pointer">
                  CSV
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="pdf" id="client-fmt-pdf" />
                <Label htmlFor="client-fmt-pdf" className="font-normal cursor-pointer">
                  PDF
                </Label>
              </div>
            </RadioGroup>
          </div>

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
                {paises.length === ALL_PAIS_CODES.length ? 'Ninguno' : 'Todos'}
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Ciudades</Label>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  const all = ciudadOptions.map((c) => c.value);
                  setCiudades(ciudades.length === all.length ? [] : all);
                }}
              >
                {ciudades.length === ciudadOptions.length &&
                ciudadOptions.length > 0
                  ? 'Ninguna'
                  : 'Todas'}
              </button>
            </div>
            {ciudadOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Seleccioná al menos un país.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                {ciudadOptions.map((c) => (
                  <label
                    key={c.value}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={ciudades.includes(c.value)}
                      onCheckedChange={(checked) =>
                        setCiudades(
                          toggleValue(ciudades, c.value, Boolean(checked))
                        )
                      }
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Marketplace</Label>
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
                  ? 'Ninguno'
                  : 'Todos'}
              </button>
            </div>
            {empresaOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay marketplaces en los datos cargados.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
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
