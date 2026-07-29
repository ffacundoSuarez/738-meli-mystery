'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ResponseDetails } from '@/components/dashboard/ResponseDetails';
import { getPublicResults } from '@/lib/data';
import {
  exportResponsesToCsv,
  exportResponsesToExcel,
  exportResponsesToPdf,
} from '@/lib/export';
import { getSectionTitle } from '@/lib/survey-config';
import { getScreeningSnapshot } from '@/lib/survey-snapshot';
import { PublicResult, SurveyResponse } from '@/lib/types';
import {
  Search,
  Eye,
  Building2,
  MapPin,
  Filter,
  Download,
  Loader2,
  BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';

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

export default function ResultadosPage() {
  const [results, setResults] = useState<PublicResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEmpresa, setFilterEmpresa] = useState('all');
  const [filterPais, setFilterPais] = useState('all');
  const [selected, setSelected] = useState<PublicResult | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setResults(await getPublicResults());
      } catch {
        toast.error('Error al cargar resultados');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Empresa = marca que el encuestado respondió; País = del screening
  const empresas = useMemo(
    () =>
      [
        ...new Set(
          results.map((s) => getScreeningSnapshot(s.answers).marca).filter(Boolean)
        ),
      ] as string[],
    [results]
  );
  const paises = useMemo(
    () =>
      [
        ...new Set(
          results.map((s) => getScreeningSnapshot(s.answers).pais).filter(Boolean)
        ),
      ] as string[],
    [results]
  );

  const filtered = results.filter((s) => {
    const snapshot = getScreeningSnapshot(s.answers);
    const term = searchTerm.toLowerCase();
    const name =
      s.nombreApellido || [s.nombre, s.apellido].filter(Boolean).join(' ') || '';
    const matchesSearch =
      term === '' ||
      name.toLowerCase().includes(term) ||
      (s.code || '').toLowerCase().includes(term) ||
      s.id.toLowerCase().includes(term);
    const matchesEmpresa =
      filterEmpresa === 'all' || snapshot.marca === filterEmpresa;
    const matchesPais = filterPais === 'all' || snapshot.pais === filterPais;
    return matchesSearch && matchesEmpresa && matchesPais;
  });

  const selectedSnapshot = selected
    ? getScreeningSnapshot(selected.answers)
    : null;

  const handleExport = async (format: 'csv' | 'excel' | 'pdf') => {
    if (filtered.length === 0) return;
    setExporting(format);
    try {
      if (format === 'csv') exportResponsesToCsv(filtered);
      else if (format === 'excel') await exportResponsesToExcel(filtered);
      else await exportResponsesToPdf(filtered);
    } catch {
      toast.error('Error al exportar');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">Mystery Shopper ML</h1>
              <p className="text-xs text-muted-foreground">Resultados del proceso</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Resultados</h2>
            <p className="text-muted-foreground">
              {loading
                ? 'Cargando...'
                : `${filtered.length} de ${results.length} postulante${results.length !== 1 ? 's' : ''} con etapas aprobadas`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('csv')}
              disabled={filtered.length === 0 || exporting !== null}
            >
              <Download className="w-4 h-4 mr-2" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('excel')}
              disabled={filtered.length === 0 || exporting !== null}
            >
              <Download className="w-4 h-4 mr-2" />
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('pdf')}
              disabled={filtered.length === 0 || exporting !== null}
            >
              <Download className="w-4 h-4 mr-2" />
              PDF
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre o ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterEmpresa} onValueChange={setFilterEmpresa}>
                <SelectTrigger className="w-full sm:w-44">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las empresas</SelectItem>
                  {empresas.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterPais} onValueChange={setFilterPais}>
                <SelectTrigger className="w-full sm:w-44">
                  <MapPin className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="País" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los países</SelectItem>
                  {paises.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">
                No hay resultados con los filtros seleccionados.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left p-4 font-medium">ID</th>
                      <th className="text-left p-4 font-medium">Nombre</th>
                      <th className="text-left p-4 font-medium">Empresa</th>
                      <th className="text-left p-4 font-medium">País</th>
                      <th className="text-left p-4 font-medium">Etapa alcanzada</th>
                      <th className="text-right p-4 font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const snapshot = getScreeningSnapshot(r.answers);
                      return (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="p-4 font-mono">{r.code || r.id}</td>
                        <td className="p-4">
                          {r.nombreApellido ||
                            [r.nombre, r.apellido].filter(Boolean).join(' ') ||
                            '-'}
                        </td>
                        <td className="p-4">
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                            {snapshot.marca || '-'}
                          </span>
                        </td>
                        <td className="p-4">
                          {snapshot.pais ? (
                            <span className="flex items-start gap-1">
                              <MapPin className="w-3.5 h-3.5 mt-0.5 text-muted-foreground" />
                              <span className="inline-flex flex-col">
                                <span>{snapshot.pais}</span>
                                {snapshot.region && (
                                  <span className="text-xs text-muted-foreground">
                                    {snapshot.region}
                                  </span>
                                )}
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-4">
                          {r.maxApprovedStage
                            ? getSectionTitle(r.maxApprovedStage)
                            : '-'}
                        </td>
                        <td className="p-4 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelected(r);
                              setDetailsOpen(true);
                            }}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Ver
                          </Button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-6xl w-[96vw] sm:max-w-6xl max-h-[92vh] overflow-y-auto p-6 sm:p-8">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-2xl">Detalles del postulante</DialogTitle>
            <DialogDescription className="text-base">
              {selected?.code ? `ID: ${selected.code}` : `ID: ${selected?.id}`}
              {selectedSnapshot?.marca ? ` · ${selectedSnapshot.marca}` : ''}
              {selectedSnapshot?.pais ? ` · ${selectedSnapshot.pais}` : ''}
              {selectedSnapshot?.region ? ` (${selectedSnapshot.region})` : ''}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <ResponseDetails response={toSurveyResponse(selected)} mode="results" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
