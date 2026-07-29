'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  adminCreatePostulante,
  adminDeletePostulante,
  adminListResponsesSummary,
  adminUnlockSurvey,
  adminUpdatePostulante,
} from '@/lib/data';
import { PAISES } from '@/lib/survey-config/constants';
import { getPartProgressLabel, getScreeningSnapshot } from '@/lib/survey-snapshot';
import { Lang, SurveyResponse } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Copy,
  Filter,
  Link as LinkIcon,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Unlock,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';

function getSurveyUrl(accessToken: string) {
  if (typeof window === 'undefined') return `/encuesta/${accessToken}`;
  return `${window.location.origin}/encuesta/${accessToken}`;
}

export default function PostulantesPage() {
  const [postulantes, setPostulantes] = useState<SurveyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [nombreApellido, setNombreApellido] = useState('');
  const [pais, setPais] = useState('');
  const [idioma, setIdioma] = useState<Lang>('es');
  const [reclutador, setReclutador] = useState('');
  const [isPrueba, setIsPrueba] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SurveyResponse | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<SurveyResponse | null>(null);
  const [editNombreApellido, setEditNombreApellido] = useState('');
  const [editReclutador, setEditReclutador] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPais, setFilterPais] = useState('all');
  const [filterTipo, setFilterTipo] = useState<'all' | 'real' | 'prueba'>('all');

  const load = async () => {
    try {
      setPostulantes(await adminListResponsesSummary());
    } catch {
      toast.error('Error al cargar postulantes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return postulantes.filter((p) => {
      const snapshot = getScreeningSnapshot(p.answers);
      const name =
        p.nombreApellido || [p.nombre, p.apellido].filter(Boolean).join(' ') || '';
      const matchesSearch =
        term === '' ||
        name.toLowerCase().includes(term) ||
        (p.code || '').toLowerCase().includes(term) ||
        (snapshot.pais || '').toLowerCase().includes(term);
      const matchesPais =
        filterPais === 'all' || snapshot.paisCode === filterPais;
      const matchesTipo =
        filterTipo === 'all' ||
        (filterTipo === 'prueba' ? Boolean(p.isPrueba) : !p.isPrueba);
      return matchesSearch && matchesPais && matchesTipo;
    });
  }, [postulantes, searchTerm, filterPais, filterTipo]);

  const resetCreateForm = () => {
    setNombreApellido('');
    setPais('');
    setIdioma('es');
    setReclutador('');
    setIsPrueba(false);
  };

  const handleCreate = async () => {
    if (!nombreApellido.trim()) {
      toast.error('Completá nombre y apellido');
      return;
    }
    if (!pais) {
      toast.error('Seleccioná un país');
      return;
    }
    setCreating(true);
    try {
      const created = await adminCreatePostulante(
        nombreApellido.trim(),
        pais,
        idioma,
        reclutador.trim() || undefined,
        isPrueba
      );
      setPostulantes((prev) => [
        {
          id: created.id,
          code: created.code,
          accessToken: created.accessToken,
          idioma: created.idioma || 'es',
          isPrueba: created.isPrueba,
          nombre: created.nombre,
          apellido: created.apellido,
          nombreApellido: created.nombreApellido,
          empresa: created.empresa,
          ciudad: created.ciudad,
          status: created.status || 'borrador',
          stages: created.stages || {},
          reviewFlags: created.reviewFlags || {},
          answers: created.answers || {},
          createdAt: created.createdAt,
          updatedAt: created.updatedAt || created.createdAt,
        },
        ...prev,
      ]);
      setDialogOpen(false);
      resetCreateForm();
      toast.success(
        `Postulante ${created.code} creado${created.isPrueba ? ' (prueba)' : ''}`
      );
    } catch {
      toast.error('No se pudo crear el postulante');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await adminDeletePostulante(deleteTarget.id);
      setPostulantes((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      toast.success(`Postulante ${deleteTarget.code || deleteTarget.id} eliminado`);
      setDeleteTarget(null);
    } catch {
      toast.error('No se pudo eliminar el postulante');
    } finally {
      setDeleting(false);
    }
  };

  /** Abre el modal de edición precargando nombre y reclutador actuales */
  const openEditDialog = (postulante: SurveyResponse) => {
    const name =
      postulante.nombreApellido ||
      [postulante.nombre, postulante.apellido].filter(Boolean).join(' ') ||
      '';
    setEditNombreApellido(name);
    setEditReclutador((postulante.answers?.['reclutador'] as string) || '');
    setEditTarget(postulante);
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    if (!editNombreApellido.trim()) {
      toast.error('Completá nombre y apellido');
      return;
    }
    setSavingEdit(true);
    try {
      const updated = await adminUpdatePostulante(
        editTarget.id,
        editNombreApellido.trim(),
        editReclutador.trim() || undefined
      );
      setPostulantes((prev) =>
        prev.map((p) =>
          p.id === updated.id
            ? {
                ...p,
                nombre: updated.nombre,
                apellido: updated.apellido,
                nombreApellido: updated.nombreApellido,
                answers: updated.answers,
                updatedAt: updated.updatedAt,
              }
            : p
        )
      );
      toast.success(`Datos de ${updated.code || updated.id} actualizados`);
      setEditTarget(null);
    } catch {
      toast.error('No se pudieron guardar los cambios');
    } finally {
      setSavingEdit(false);
    }
  };

  const copyLink = async (accessToken?: string) => {
    if (!accessToken) return;
    await navigator.clipboard.writeText(getSurveyUrl(accessToken));
    toast.success('Link copiado al portapapeles');
  };

  const handleReopenSurvey = async (postulante: SurveyResponse) => {
    setReopeningId(postulante.id);
    try {
      const updated = await adminUnlockSurvey(postulante.id);
      setPostulantes((prev) =>
        prev.map((p) =>
          p.id === updated.id
            ? {
                ...p,
                answers: updated.answers,
                stages: updated.stages,
                status: updated.status,
                updatedAt: updated.updatedAt,
              }
            : p
        )
      );
      toast.success(`Cuestionario de ${postulante.code || postulante.id} reabierto`);
    } catch {
      toast.error('No se pudo reabrir el cuestionario');
    } finally {
      setReopeningId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Postulantes</h1>
          <p className="text-muted-foreground">
            {loading
              ? 'Cargando...'
              : `${filtered.length} de ${postulantes.length} postulante${postulantes.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo postulante
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Generador de links
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 px-1">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, ID o país..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterPais} onValueChange={setFilterPais}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="w-4 h-4 mr-2 shrink-0" />
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
            <Select
              value={filterTipo}
              onValueChange={(v) => setFilterTipo(v as 'all' | 'real' | 'prueba')}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="real">Reales</SelectItem>
                <SelectItem value="prueba">Pruebas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : postulantes.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              Todavía no hay postulantes. Creá uno para generar su link de encuesta.
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              No hay postulantes que coincidan con los filtros.
            </p>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left p-3 pl-6 font-medium">ID</th>
                    <th className="text-left p-3 font-medium">Nombre</th>
                    <th className="text-left p-3 font-medium">País</th>
                    <th className="text-left p-3 font-medium hidden md:table-cell">Progreso</th>
                    <th className="text-left p-3 font-medium hidden xl:table-cell">Link</th>
                    <th className="text-right p-3 pr-6 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const snapshot = getScreeningSnapshot(p.answers);
                    const progress = getPartProgressLabel(p.stages);
                    const displayName =
                      p.nombreApellido ||
                      [p.nombre, p.apellido].filter(Boolean).join(' ') ||
                      '-';
                    // El reclutador se guarda en las answers al crear el postulante
                    const reclutador = (p.answers?.['reclutador'] as string) || '';

                    return (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="p-3 pl-6 font-mono font-medium whitespace-nowrap">
                          <span className="inline-flex items-center gap-2">
                            {p.code}
                            {p.isPrueba && (
                              <Badge variant="outline" className="text-[10px] py-0">
                                Prueba
                              </Badge>
                            )}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="inline-flex flex-col">
                            <span>{displayName}</span>
                            {reclutador && (
                              <span className="text-xs text-muted-foreground">
                                Reclutador: {reclutador}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="p-3">
                          {snapshot.hasScreening ? (
                            <span className="inline-flex flex-col">
                              <span>{snapshot.pais}</span>
                              {snapshot.region && (
                                <span className="text-xs text-muted-foreground">
                                  {snapshot.region}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 hidden md:table-cell text-muted-foreground">
                          {progress}
                        </td>
                        <td className="p-3 hidden xl:table-cell max-w-48">
                          <span className="text-muted-foreground truncate block">
                            {p.accessToken ? getSurveyUrl(p.accessToken) : '-'}
                          </span>
                        </td>
                        <td className="p-3 pr-6">
                          <div className="flex justify-end items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyLink(p.accessToken)}
                              disabled={!p.accessToken}
                            >
                              <Copy className="w-4 h-4 sm:mr-1" />
                              <span className="hidden sm:inline">Copiar</span>
                            </Button>
                            {p.accessToken && (
                              <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex">
                                <a
                                  href={getSurveyUrl(p.accessToken)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <LinkIcon className="w-4 h-4 mr-1" />
                                  Abrir
                                </a>
                              </Button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="px-2">
                                  <MoreHorizontal className="w-4 h-4" />
                                  <span className="sr-only">Más acciones</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {p.accessToken && (
                                  <DropdownMenuItem asChild className="sm:hidden">
                                    <a
                                      href={getSurveyUrl(p.accessToken)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <LinkIcon className="w-4 h-4 mr-2" />
                                      Abrir encuesta
                                    </a>
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => openEditDialog(p)}>
                                  <Pencil className="w-4 h-4 mr-2" />
                                  Editar datos
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={reopeningId === p.id}
                                  onClick={() => handleReopenSurvey(p)}
                                >
                                  {reopeningId === p.id ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  ) : (
                                    <Unlock className="w-4 h-4 mr-2" />
                                  )}
                                  Reabrir cuestionario
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600"
                                  onClick={() => setDeleteTarget(p)}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Eliminar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
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

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetCreateForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo postulante</DialogTitle>
            <DialogDescription>
              Se generará un ID (ej. 01ARG o T01ARG si es prueba) y un link único de encuesta.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="nombre-apellido">Nombre y apellido</Label>
              <Input
                id="nombre-apellido"
                value={nombreApellido}
                onChange={(e) => setNombreApellido(e.target.value)}
                placeholder="Ej: Juan Pérez"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pais">País</Label>
              <Select value={pais} onValueChange={setPais}>
                <SelectTrigger id="pais">
                  <SelectValue placeholder="Seleccionar país" />
                </SelectTrigger>
                <SelectContent>
                  {PAISES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                La región (ej. AMBA) aparecerá en la tabla cuando el encuestado la complete en el cuestionario.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="idioma">Idioma del cuestionario</Label>
              <Select value={idioma} onValueChange={(v) => setIdioma(v as Lang)}>
                <SelectTrigger id="idioma">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="pt">Português (Portugal)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reclutador">Reclutador</Label>
              <Input
                id="reclutador"
                value={reclutador}
                onChange={(e) => setReclutador(e.target.value)}
                placeholder="Nombre del reclutador"
              />
            </div>
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                id="is-prueba"
                checked={isPrueba}
                onCheckedChange={(checked) => setIsPrueba(checked === true)}
              />
              <div className="space-y-1">
                <Label htmlFor="is-prueba" className="cursor-pointer">
                  Encuesta de prueba
                </Label>
                <p className="text-xs text-muted-foreground">
                  Genera un ID con prefijo T (ej. T01ARG) para que empresas prueben el
                  cuestionario sin usar los links reales.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Crear postulante
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar datos</DialogTitle>
            <DialogDescription>
              Actualizá el nombre y el reclutador de{' '}
              <strong>{editTarget?.code || editTarget?.id}</strong>. País, idioma y tipo
              (prueba) no se pueden cambiar para no romper el ID.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-nombre-apellido">Nombre y apellido</Label>
              <Input
                id="edit-nombre-apellido"
                value={editNombreApellido}
                onChange={(e) => setEditNombreApellido(e.target.value)}
                placeholder="Ej: Juan Pérez"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-reclutador">Reclutador</Label>
              <Input
                id="edit-reclutador"
                value={editReclutador}
                onChange={(e) => setEditReclutador(e.target.value)}
                placeholder="Nombre del reclutador"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditTarget(null)}
              disabled={savingEdit}
            >
              Cancelar
            </Button>
            <Button onClick={handleEditSave} disabled={savingEdit}>
              {savingEdit && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar postulante</DialogTitle>
            <DialogDescription>
              ¿Eliminar a{' '}
              <strong>
                {deleteTarget?.code} ·{' '}
                {[deleteTarget?.nombre, deleteTarget?.apellido].filter(Boolean).join(' ') ||
                  'Sin nombre'}
              </strong>
              ? Se borrará el registro y su link dejará de funcionar. Esta acción no se puede
              deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
