'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  ResponseDetails,
  REVISION_STATUS_LABELS,
  STAGE_STATUS_COLORS,
} from '@/components/dashboard/ResponseDetails';
import { RevisionDownloadDialog } from '@/components/dashboard/RevisionDownloadDialog';
import {
  adminListResponsesSummary,
  adminReviewStage,
  adminUnlockSurvey,
  adminUpdateAnswers,
  getResponseByToken,
} from '@/lib/data';
import { getSectionTitle, REVIEWABLE_SECTIONS } from '@/lib/survey-config';
import { CIUDADES, PAISES } from '@/lib/survey-config/constants';
import { evaluateCondition } from '@/lib/survey-logic';
import { getScreeningSnapshot } from '@/lib/survey-snapshot';
import { AnswerValue, StageStatus, SurveyResponse } from '@/lib/types';
import {
  Eye,
  Building2,
  MapPin,
  Clock,
  Loader2,
  Filter,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function displayName(r: SurveyResponse) {
  return (
    r.nombreApellido ||
    [r.nombre, r.apellido].filter(Boolean).join(' ') ||
    'Sin nombre'
  );
}

function pendingStageIds(r: SurveyResponse): string[] {
  return REVIEWABLE_SECTIONS.filter(
    (id) => r.stages?.[id]?.status === 'en_revision'
  );
}

function getStageBadgeLabel(sectionId: string, status: StageStatus): string {
  const title = getSectionTitle(sectionId);
  const statusLabel = REVISION_STATUS_LABELS[status] || status;
  return `${title} · ${statusLabel}`;
}

export default function RevisionPage() {
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SurveyResponse | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [detailsLoadingId, setDetailsLoadingId] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [filterNombre, setFilterNombre] = useState('');
  const [filterEmpresa, setFilterEmpresa] = useState('');
  const [filterId, setFilterId] = useState('');
  const [filterEtapa, setFilterEtapa] = useState('all');
  const [filterEstado, setFilterEstado] = useState('all');
  const [filterPais, setFilterPais] = useState('all');
  const [filterCiudad, setFilterCiudad] = useState('all');
  const [filterTipo, setFilterTipo] = useState<'all' | 'real' | 'prueba'>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);

  /** Ciudades visibles según el país seleccionado (o todas si país = Todos) */
  const ciudadOptions = useMemo(() => {
    if (filterPais === 'all') return CIUDADES;
    return CIUDADES.filter((c) =>
      evaluateCondition(c.showIf, { 'f1-pais': filterPais })
    );
  }, [filterPais]);

  // Si cambia el país y la ciudad elegida ya no aplica, resetear a Todas
  useEffect(() => {
    if (
      filterCiudad !== 'all' &&
      !ciudadOptions.some((c) => c.value === filterCiudad)
    ) {
      setFilterCiudad('all');
    }
  }, [filterCiudad, ciudadOptions]);


  const load = async () => {
    try {
      const all = await adminListResponsesSummary();
      setResponses(all);
    } catch {
      toast.error('Error al cargar postulantes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredResponses = useMemo(() => {
    const nombre = filterNombre.trim().toLowerCase();
    const empresa = filterEmpresa.trim().toLowerCase();
    const id = filterId.trim().toLowerCase();

    return responses.filter((r) => {
      const snapshot = getScreeningSnapshot(r.answers);
      const name = displayName(r).toLowerCase();
      const codeOrId = (r.code || r.id).toLowerCase();
      const stageEntries = REVIEWABLE_SECTIONS.map((sectionId) => ({
        sectionId,
        status: r.stages?.[sectionId]?.status as StageStatus | undefined,
      })).filter((e) => e.status);

      const matchesNombre = !nombre || name.includes(nombre);
      const matchesEmpresa =
        !empresa || (snapshot.marca || '').toLowerCase().includes(empresa);
      const matchesId =
        !id || codeOrId.includes(id) || r.id.toLowerCase().includes(id);
      const matchesEtapa =
        filterEtapa === 'all' ||
        stageEntries.some((e) => e.sectionId === filterEtapa);
      const matchesEstado =
        filterEstado === 'all' ||
        stageEntries.some((e) => e.status === filterEstado);
      const matchesPais =
        filterPais === 'all' || snapshot.paisCode === filterPais;
      const ciudadCode = r.answers['q10-ciudad'] as string | undefined;
      const matchesCiudad =
        filterCiudad === 'all' || ciudadCode === filterCiudad;
      const matchesTipo =
        filterTipo === 'all' ||
        (filterTipo === 'prueba' ? Boolean(r.isPrueba) : !r.isPrueba);

      return (
        matchesNombre &&
        matchesEmpresa &&
        matchesId &&
        matchesEtapa &&
        matchesEstado &&
        matchesPais &&
        matchesCiudad &&
        matchesTipo
      );
    });
  }, [
    responses,
    filterNombre,
    filterEmpresa,
    filterId,
    filterEtapa,
    filterEstado,
    filterPais,
    filterCiudad,
    filterTipo,
  ]);

  const filteredPendingStages = useMemo(
    () => filteredResponses.reduce((sum, r) => sum + pendingStageIds(r).length, 0),
    [filteredResponses]
  );

  /** Cantidad de filtros del panel (excluye el buscador de nombre) */
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterEmpresa.trim()) count += 1;
    if (filterId.trim()) count += 1;
    if (filterEtapa !== 'all') count += 1;
    if (filterEstado !== 'all') count += 1;
    if (filterPais !== 'all') count += 1;
    if (filterCiudad !== 'all') count += 1;
    if (filterTipo !== 'all') count += 1;
    return count;
  }, [
    filterEmpresa,
    filterId,
    filterEtapa,
    filterEstado,
    filterPais,
    filterCiudad,
    filterTipo,
  ]);

  const clearFilters = () => {
    setFilterEmpresa('');
    setFilterId('');
    setFilterEtapa('all');
    setFilterEstado('all');
    setFilterPais('all');
    setFilterCiudad('all');
    setFilterTipo('all');
  };

  const handleReview = async (
    sectionId: string,
    action: 'aprobar' | 'rechazar' | 'en_revision',
    reviewFlags?: import('@/lib/types').ReviewFlagsMap
  ) => {
    if (!selected) return;
    setActionLoading(sectionId);
    try {
      const updated = await adminReviewStage(
        selected.id,
        sectionId,
        action,
        'Ops',
        undefined,
        reviewFlags
      );
      setSelected(updated);
      setResponses((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r))
      );

      const title = getSectionTitle(sectionId);
      const toastMsg =
        action === 'aprobar'
          ? `Etapa "${title}" aprobada`
          : action === 'en_revision'
            ? `Etapa "${title}" puesta en revisión`
            : reviewFlags && Object.keys(reviewFlags).length > 0
              ? `Correcciones enviadas en "${title}"`
              : `Etapa "${title}" marcada como rechazada`;
      toast.success(toastMsg);
    } catch {
      toast.error('No se pudo procesar la revisión');
    } finally {
      setActionLoading(null);
    }
  };

  /** Mapea el status elegido en el Select al action del RPC */
  const handleSetStageStatus = async (sectionId: string, status: StageStatus) => {
    const action =
      status === 'aprobada'
        ? 'aprobar'
        : status === 'rechazada'
          ? 'rechazar'
          : status === 'en_revision'
            ? 'en_revision'
            : null;
    if (!action) return;
    await handleReview(sectionId, action);
  };

  const handleSaveAnswers = async (answersDiff: Record<string, AnswerValue>) => {
    if (!selected) return;
    setSaveLoading(true);
    try {
      const updated = await adminUpdateAnswers(selected.id, answersDiff);
      setSelected(updated);
      setResponses((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r))
      );
      toast.success('Respuestas guardadas');
    } catch {
      toast.error('No se pudieron guardar las respuestas');
    } finally {
      setSaveLoading(false);
    }
  };

  const openDetails = async (response: SurveyResponse) => {
    if (!response.accessToken) {
      toast.error('No se encontró el token de acceso');
      return;
    }

    setDetailsLoadingId(response.id);
    try {
      const full = await getResponseByToken(response.accessToken);
      if (!full) {
        toast.error('No se encontró la encuesta');
        return;
      }
      setSelected(full);
      setDetailsOpen(true);
    } catch {
      toast.error('Error al cargar los detalles');
    } finally {
      setDetailsLoadingId(null);
    }
  };

  const handleUnlockSurvey = async () => {
    if (!selected) return;
    setUnlockLoading(true);
    try {
      const updated = await adminUnlockSurvey(selected.id);
      setSelected(updated);
      setResponses((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r))
      );
      toast.success('Encuesta desbloqueada. El postulante puede editar de nuevo.');
    } catch {
      toast.error('No se pudo desbloquear la encuesta');
    } finally {
      setUnlockLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div className="shrink-0">
          <h1 className="text-2xl font-bold tracking-tight">Revisión</h1>
          <p className="text-muted-foreground text-sm">
            {loading
              ? 'Cargando...'
              : `${filteredResponses.length} de ${responses.length} postulante${responses.length !== 1 ? 's' : ''} · ${filteredPendingStages} etapa${filteredPendingStages !== 1 ? 's' : ''} pendiente${filteredPendingStages !== 1 ? 's' : ''} de revisar`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <Input
            placeholder="Buscar por nombre..."
            value={filterNombre}
            onChange={(e) => setFilterNombre(e.target.value)}
            className="h-9 w-full sm:w-56"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => setFiltersOpen(true)}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filtros
            {activeFilterCount > 0 && (
              <Badge
                variant="secondary"
                className="ml-2 h-5 min-w-5 px-1.5 text-[10px]"
              >
                {activeFilterCount}
              </Badge>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => setDownloadOpen(true)}
          >
            <Download className="w-4 h-4 mr-2" />
            Descargar
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : responses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <h3 className="text-lg font-medium mb-1">Sin postulantes</h3>
            <p className="text-muted-foreground text-center">
              No hay postulantes registrados en el sistema.
            </p>
          </CardContent>
        </Card>
      ) : filteredResponses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10">
            <p className="text-muted-foreground text-center">
              No hay resultados con los filtros seleccionados.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredResponses.map((response) => {
            const snapshot = getScreeningSnapshot(response.answers);
            const stageBadges = REVIEWABLE_SECTIONS.map((sectionId) => {
              const status = response.stages?.[sectionId]?.status as StageStatus | undefined;
              if (!status) return null;
              return { sectionId, status };
            }).filter(Boolean) as { sectionId: string; status: StageStatus }[];

            return (
              <Card key={response.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h3 className="font-semibold text-base">{displayName(response)}</h3>
                        <p className="text-xs text-muted-foreground">
                          {response.code ? `ID: ${response.code}` : `ID: ${response.id}`}
                        </p>
                        {response.isPrueba && (
                          <Badge variant="outline" className="text-[10px] py-0">
                            Prueba
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {stageBadges.length > 0 ? (
                          stageBadges.map(({ sectionId, status }) => (
                            <Badge
                              key={sectionId}
                              variant="outline"
                              className={cn(
                                'text-xs py-0.5',
                                STAGE_STATUS_COLORS[status]
                              )}
                            >
                              {getStageBadgeLabel(sectionId, status)}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="outline" className="text-xs py-0.5 text-muted-foreground">
                            Sin etapas iniciadas
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 shrink-0" />
                          {snapshot.marca || '-'}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          {snapshot.pais ? (
                            <span className="inline-flex flex-col">
                              <span>{snapshot.pais}</span>
                              {snapshot.region && (
                                <span className="text-[10px] text-muted-foreground/80">
                                  {snapshot.region}
                                </span>
                              )}
                            </span>
                          ) : (
                            '-'
                          )}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          {new Date(response.updatedAt).toLocaleDateString('es-ES', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => openDetails(response)}
                      disabled={detailsLoadingId === response.id}
                    >
                      {detailsLoadingId === response.id ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Eye className="w-4 h-4 mr-2" />
                      )}
                      Ver Detalles
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-6xl w-[96vw] sm:max-w-6xl max-h-[92vh] overflow-y-auto p-6 sm:p-8">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-2xl">
              {selected ? displayName(selected) : 'Detalles'}
            </DialogTitle>
            <DialogDescription className="text-base">
              {selected?.code ? `ID: ${selected.code}` : selected ? `ID: ${selected.id}` : ''}
              {selected &&
                (() => {
                  const snapshot = getScreeningSnapshot(selected.answers);
                  return (
                    <>
                      {snapshot.marca ? ` · ${snapshot.marca}` : ''}
                      {snapshot.pais
                        ? ` · ${snapshot.pais}${snapshot.region ? `, ${snapshot.region}` : ''}`
                        : ''}
                    </>
                  );
                })()}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <ResponseDetails
              response={selected}
              mode="revision"
              showStageActions
              allowEditAnswers
              actionLoading={actionLoading}
              saveLoading={saveLoading}
              unlockLoading={unlockLoading}
              onUnlockSurvey={handleUnlockSurvey}
              onApproveStage={(sectionId) => handleReview(sectionId, 'aprobar')}
              onSendCorrections={(sectionId, flags) =>
                handleReview(sectionId, 'rechazar', flags)
              }
              onSetStageStatus={handleSetStageStatus}
              onSaveAnswers={handleSaveAnswers}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Panel de filtros */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filtros</SheetTitle>
            <SheetDescription>
              Filtrá la lista de postulantes. El buscador de nombre queda en la barra.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4">
            <div className="space-y-2">
              <Label htmlFor="filter-empresa">Empresa</Label>
              <Input
                id="filter-empresa"
                placeholder="Ej. Mercado Libre, Mercado Pago..."
                value={filterEmpresa}
                onChange={(e) => setFilterEmpresa(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter-id">ID</Label>
              <Input
                id="filter-id"
                placeholder="Código o ID"
                value={filterId}
                onChange={(e) => setFilterId(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Etapa</Label>
              <Select value={filterEtapa} onValueChange={setFilterEtapa}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Etapa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las etapas</SelectItem>
                  {REVIEWABLE_SECTIONS.map((sectionId) => (
                    <SelectItem key={sectionId} value={sectionId}>
                      {getSectionTitle(sectionId)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={filterEstado} onValueChange={setFilterEstado}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="en_revision">En revisión</SelectItem>
                  <SelectItem value="aprobada">Aprobada</SelectItem>
                  <SelectItem value="rechazada">Rechazada</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>País</Label>
              <Select value={filterPais} onValueChange={setFilterPais}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="País" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los países</SelectItem>
                  {PAISES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Ciudad</Label>
              <Select value={filterCiudad} onValueChange={setFilterCiudad}>
                <SelectTrigger className="w-full">
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

            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={filterTipo}
                onValueChange={(v) =>
                  setFilterTipo(v as 'all' | 'real' | 'prueba')
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="real">Reales</SelectItem>
                  <SelectItem value="prueba">Pruebas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <SheetFooter>
            <Button
              variant="outline"
              onClick={clearFilters}
              disabled={activeFilterCount === 0}
            >
              Limpiar filtros
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>Aplicar</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <RevisionDownloadDialog
        open={downloadOpen}
        onOpenChange={setDownloadOpen}
        responses={responses}
      />
    </div>
  );
}
