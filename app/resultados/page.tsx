'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { ClientDownloadDialog } from '@/components/dashboard/ClientDownloadDialog';
import { getResultados, ResultadosAuthError } from '@/lib/data';
import { clearResultadosCredentials } from '@/lib/resultados-auth';
import { getSectionTitle } from '@/lib/survey-config';
import { CIUDADES } from '@/lib/survey-config/constants';
import { evaluateCondition } from '@/lib/survey-logic';
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
  LogOut,
  LayoutDashboard,
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
  const router = useRouter();
  const [results, setResults] = useState<PublicResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [isOpsViewer, setIsOpsViewer] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEmpresa, setFilterEmpresa] = useState('all');
  const [filterPais, setFilterPais] = useState('all');
  const [filterCiudad, setFilterCiudad] = useState('all');
  const [selected, setSelected] = useState<PublicResult | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { results: data, isOpsViewer: opsViewer } = await getResultados();
        setResults(data);
        setIsOpsViewer(opsViewer);
      } catch (err) {
        if (err instanceof ResultadosAuthError) {
          if (err.code === 'passcode_invalid') {
            router.replace('/acceso?redirect=/resultados');
            return;
          }
          router.replace('/resultados/acceso?redirect=/resultados');
          return;
        }
        toast.error('Error al cargar resultados');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      clearResultadosCredentials();
      await fetch('/api/resultados/acceso', { method: 'DELETE' });
      router.push('/resultados/acceso');
    } catch {
      toast.error('Error al cerrar sesión');
    } finally {
      setLoggingOut(false);
    }
  };

  // Empresa = marca; País = screening; Ciudad = A09
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

  /** Código de país del filtro (label → code) para filtrar ciudades. */
  const filterPaisCode = useMemo(() => {
    if (filterPais === 'all') return 'all';
    const found = results
      .map((r) => getScreeningSnapshot(r.answers))
      .find((s) => s.pais === filterPais);
    return found?.paisCode || 'all';
  }, [filterPais, results]);

  const ciudadOptions = useMemo(() => {
    if (filterPaisCode === 'all') {
      // Solo ciudades presentes en los datos
      const present = new Set(
        results
          .map((r) => r.answers?.['q10-ciudad'] as string | undefined)
          .filter(Boolean) as string[]
      );
      return CIUDADES.filter((c) => present.has(c.value));
    }
    return CIUDADES.filter((c) =>
      evaluateCondition(c.showIf, { 'f1-pais': filterPaisCode })
    );
  }, [filterPaisCode, results]);

  useEffect(() => {
    if (
      filterCiudad !== 'all' &&
      !ciudadOptions.some((c) => c.value === filterCiudad)
    ) {
      setFilterCiudad('all');
    }
  }, [filterCiudad, ciudadOptions]);

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
    const cityCode = s.answers?.['q10-ciudad'] as string | undefined;
    const matchesCiudad =
      filterCiudad === 'all' || cityCode === filterCiudad;
    return matchesSearch && matchesEmpresa && matchesPais && matchesCiudad;
  });

  const selectedSnapshot = selected
    ? getScreeningSnapshot(selected.answers)
    : null;

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
              <p className="text-xs text-muted-foreground">Resultados del estudio</p>
            </div>
          </div>
          {isOpsViewer ? (
            <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')}>
              <LayoutDashboard className="w-4 h-4 mr-2" />
              Volver al panel
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              disabled={loggingOut}
            >
              {loggingOut ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4 mr-2" />
              )}
              Cerrar sesión
            </Button>
          )}
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDownloadOpen(true)}
            disabled={loading || results.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Descargar
          </Button>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
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
              <Select value={filterCiudad} onValueChange={setFilterCiudad}>
                <SelectTrigger className="w-full sm:w-44">
                  <MapPin className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Ciudad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las ciudades</SelectItem>
                  {ciudadOptions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
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
                                {snapshot.ciudad && (
                                  <span className="text-xs text-muted-foreground">
                                    {snapshot.ciudad}
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

      <ClientDownloadDialog
        open={downloadOpen}
        onOpenChange={setDownloadOpen}
        results={results}
        initialPais={filterPais}
        initialCiudad={filterCiudad}
        initialEmpresa={filterEmpresa}
      />

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-6xl w-[96vw] sm:max-w-6xl max-h-[92vh] overflow-y-auto p-6 sm:p-8">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-2xl">Detalles del postulante</DialogTitle>
            <DialogDescription className="text-base">
              {selected?.code ? `ID: ${selected.code}` : `ID: ${selected?.id}`}
              {selectedSnapshot?.marca ? ` · ${selectedSnapshot.marca}` : ''}
              {selectedSnapshot?.pais ? ` · ${selectedSnapshot.pais}` : ''}
              {selectedSnapshot?.ciudad ? ` (${selectedSnapshot.ciudad})` : ''}
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
