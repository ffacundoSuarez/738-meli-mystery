'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartTooltip,
  PAIS_COLORS,
  STAGE_STACK_COLORS,
} from '@/components/dashboard/ChartTooltip';
import { adminListResponsesSummary } from '@/lib/data';
import { getSectionTitle, REVIEWABLE_SECTIONS } from '@/lib/survey-config';
import { getScreeningSnapshot, hasAnsweredFirstStage } from '@/lib/survey-snapshot';
import { SurveyResponse } from '@/lib/types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { ClipboardCheck, FileCheck2, Clock, UserPlus, Loader2 } from 'lucide-react';

type CrossRow = Record<string, string | number>;

/**
 * Cuenta filas × series (ej. país × categoría) y devuelve filas listas para Recharts.
 * Cada fila tiene `name` (clave de fila) + una clave numérica por serie.
 */
function crossCount(
  items: SurveyResponse[],
  getRowKey: (r: SurveyResponse) => string | undefined,
  getSeriesKey: (r: SurveyResponse) => string | undefined,
  options?: { rowFallback?: string; seriesFallback?: string; seriesOrder?: string[] }
): { rows: CrossRow[]; seriesKeys: string[] } {
  const rowFallback = options?.rowFallback ?? 'Sin dato';
  const seriesFallback = options?.seriesFallback ?? 'Sin dato';
  const map = new Map<string, Map<string, number>>();
  const seriesSeen = new Set<string>();

  for (const r of items) {
    const rowKey = getRowKey(r) || rowFallback;
    const seriesKey = getSeriesKey(r) || seriesFallback;
    seriesSeen.add(seriesKey);
    if (!map.has(rowKey)) map.set(rowKey, new Map());
    const seriesMap = map.get(rowKey)!;
    seriesMap.set(seriesKey, (seriesMap.get(seriesKey) || 0) + 1);
  }

  const seriesKeys =
    options?.seriesOrder?.filter((k) => seriesSeen.has(k)) ??
    [...seriesSeen].sort((a, b) => a.localeCompare(b, 'es'));

  const rows: CrossRow[] = [...map.entries()]
    .map(([name, seriesMap]) => {
      const row: CrossRow = { name };
      let total = 0;
      for (const key of seriesKeys) {
        const v = seriesMap.get(key) || 0;
        row[key] = v;
        total += v;
      }
      // Series vistas fuera del orden fijo (si lo hay)
      for (const [key, v] of seriesMap) {
        if (!(key in row)) {
          row[key] = v;
          total += v;
        }
      }
      row.__total = total;
      return row;
    })
    .sort((a, b) => Number(b.__total) - Number(a.__total))
    .map(({ __total: _omit, ...rest }) => rest);

  // Incluir series extra encontradas si no estaban en seriesOrder
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key !== 'name' && !seriesKeys.includes(key)) seriesKeys.push(key);
    }
  }

  return { rows, seriesKeys };
}

/** Color estable para un país (palette conocida o fallback por índice). */
function colorForPais(pais: string, index: number): string {
  return PAIS_COLORS[pais] || ['#FFDE00', '#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#64748b'][index % 8];
}

export default function DashboardPage() {
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setResponses(await adminListResponsesSummary());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const realResponses = useMemo(
    () => responses.filter((r) => !r.isPrueba),
    [responses]
  );

  /**
   * Base de los cruces y métricas: solo encuestas contestadas en la primera
   * etapa (Parte 1 enviada). Los links generados sin responder no se cuentan.
   */
  const answeredResponses = useMemo(
    () => realResponses.filter((r) => hasAnsweredFirstStage(r.stages)),
    [realResponses]
  );

  const counts = useMemo(() => {
    let approvedStages = 0;
    let pendingReviews = 0;
    for (const r of answeredResponses) {
      for (const sectionId of REVIEWABLE_SECTIONS) {
        const status = r.stages?.[sectionId]?.status;
        if (status === 'en_revision') pendingReviews++;
        else if (status === 'aprobada') approvedStages++;
      }
    }
    return {
      postulantes: realResponses.length,
      contestadas: answeredResponses.length,
      pendingReviews,
      approvedStages,
    };
  }, [realResponses, answeredResponses]);

  /** País × Competidor — barras agrupadas */
  const paisCompetidor = useMemo(
    () =>
      crossCount(
        answeredResponses,
        (r) => getScreeningSnapshot(r.answers).pais,
        (r) => getScreeningSnapshot(r.answers).competidor,
        { rowFallback: 'Sin país', seriesFallback: 'Sin competidor' }
      ),
    [answeredResponses]
  );

  /** País × Categoría de producto — barras agrupadas */
  const paisCategoria = useMemo(
    () =>
      crossCount(
        answeredResponses,
        (r) => getScreeningSnapshot(r.answers).pais,
        (r) => getScreeningSnapshot(r.answers).categoria,
        { rowFallback: 'Sin país', seriesFallback: 'Sin categoría' }
      ),
    [answeredResponses]
  );

  /** País × Tipo de entrega (pregunta 32) — barras agrupadas */
  const paisTipoEntrega = useMemo(
    () =>
      crossCount(
        answeredResponses,
        (r) => getScreeningSnapshot(r.answers).pais,
        (r) => getScreeningSnapshot(r.answers).tipoEntrega,
        { rowFallback: 'Sin país', seriesFallback: 'Sin dato' }
      ),
    [answeredResponses]
  );

  /** País × Estado de etapas — barras apiladas (cuenta stages, no encuestas) */
  const paisEstado = useMemo(() => {
    const map = new Map<
      string,
      { name: string; aprobada: number; en_revision: number; rechazada: number; total: number }
    >();
    for (const r of answeredResponses) {
      const name = getScreeningSnapshot(r.answers).pais || 'Sin país';
      if (!map.has(name)) {
        map.set(name, { name, aprobada: 0, en_revision: 0, rechazada: 0, total: 0 });
      }
      const row = map.get(name)!;
      for (const st of Object.values(r.stages || {})) {
        if (st.status === 'aprobada') {
          row.aprobada++;
          row.total++;
        } else if (st.status === 'en_revision') {
          row.en_revision++;
          row.total++;
        } else if (st.status === 'rechazada') {
          row.rechazada++;
          row.total++;
        }
      }
    }
    return [...map.values()]
      .sort((a, b) => b.total - a.total)
      .map(({ total: _t, ...rest }) => rest);
  }, [answeredResponses]);

  /** Competidor × País — barras apiladas */
  const competidorPais = useMemo(
    () =>
      crossCount(
        answeredResponses,
        (r) => getScreeningSnapshot(r.answers).competidor,
        (r) => getScreeningSnapshot(r.answers).pais,
        { rowFallback: 'Sin competidor', seriesFallback: 'Sin país' }
      ),
    [answeredResponses]
  );

  const stats = [
    {
      title: 'Postulantes',
      value: counts.postulantes,
      description: 'Registrados en el sistema',
      icon: UserPlus,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'Etapas en revisión',
      value: counts.pendingReviews,
      description: 'Pendientes de aprobar',
      icon: Clock,
      color: 'text-amber-600',
      bgColor: 'bg-amber-100',
    },
    {
      title: 'Etapas aprobadas',
      value: counts.approvedStages,
      description: 'Visibles en /resultados',
      icon: FileCheck2,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      title: 'Encuestas contestadas',
      value: counts.contestadas,
      description: 'Con Parte 1 enviada',
      icon: ClipboardCheck,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Resumen general del sistema Mystery Shopper Mercado Libre
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-semibold">Cruces</h2>
        <p className="text-sm text-muted-foreground">
          País, competidor, categoría y tipo de entrega — solo encuestas contestadas (Parte 1 enviada)
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>País × Competidor</CardTitle>
            <CardDescription>Marketplace evaluado por país</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={paisCompetidor.rows}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'rgba(15,23,42,0.05)' }}
                    wrapperStyle={{ outline: 'none' }}
                  />
                  <Legend />
                  {paisCompetidor.seriesKeys.map((key, i) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      name={key}
                      fill={
                        ['#FFE600', '#3483FA', '#00A650', '#F23D4F', '#64748b'][i % 5]
                      }
                      radius={[4, 4, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>País × Categoría</CardTitle>
            <CardDescription>Categoría de producto por país</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={paisCategoria.rows}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'rgba(15,23,42,0.05)' }}
                    wrapperStyle={{ outline: 'none' }}
                  />
                  <Legend />
                  {paisCategoria.seriesKeys.slice(0, 8).map((key, i) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      name={key.length > 24 ? `${key.slice(0, 22)}…` : key}
                      fill={
                        ['#3483FA', '#00A650', '#F23D4F', '#FFE600', '#a855f7', '#06b6d4', '#f59e0b', '#64748b'][
                          i % 8
                        ]
                      }
                      radius={[4, 4, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>País × Estado de etapas</CardTitle>
            <CardDescription>
              Etapas aprobadas, en revisión y rechazadas por país
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={paisEstado}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'rgba(15,23,42,0.05)' }}
                    wrapperStyle={{ outline: 'none' }}
                  />
                  <Legend />
                  <Bar
                    dataKey="aprobada"
                    name="Aprobada"
                    stackId="a"
                    fill={STAGE_STACK_COLORS.aprobada}
                  />
                  <Bar
                    dataKey="en_revision"
                    name="En revisión"
                    stackId="a"
                    fill={STAGE_STACK_COLORS.en_revision}
                  />
                  <Bar
                    dataKey="rechazada"
                    name="Rechazada"
                    stackId="a"
                    fill={STAGE_STACK_COLORS.rechazada}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>País × Tipo de entrega</CardTitle>
            <CardDescription>
              Tarde / A tiempo / Temprano / Nunca llegó / Cancelado
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={paisTipoEntrega.rows}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'rgba(15,23,42,0.05)' }}
                    wrapperStyle={{ outline: 'none' }}
                  />
                  <Legend />
                  {paisTipoEntrega.seriesKeys.map((key, i) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      name={key.length > 28 ? `${key.slice(0, 26)}…` : key}
                      fill={
                        ['#F23D4F', '#00A650', '#3483FA', '#64748b', '#f59e0b'][i % 5]
                      }
                      radius={[4, 4, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Competidor × País</CardTitle>
            <CardDescription>Distribución de competidores por país</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={competidorPais.rows}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'rgba(15,23,42,0.05)' }}
                    wrapperStyle={{ outline: 'none' }}
                  />
                  <Legend />
                  {competidorPais.seriesKeys.map((pais, i) => (
                    <Bar
                      key={pais}
                      dataKey={pais}
                      name={pais}
                      stackId="a"
                      fill={colorForPais(pais, i)}
                      radius={
                        i === competidorPais.seriesKeys.length - 1
                          ? [4, 4, 0, 0]
                          : undefined
                      }
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Actividad reciente</CardTitle>
          <CardDescription>Últimos postulantes actualizados</CardDescription>
        </CardHeader>
        <CardContent>
          {realResponses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin datos todavía.</p>
          ) : (
            <div className="space-y-4">
              {realResponses.slice(0, 8).map((r) => {
                const pendingStages = Object.entries(r.stages || {}).filter(
                  ([, st]) => st.status === 'en_revision'
                );
                const approvedStages = Object.entries(r.stages || {}).filter(
                  ([, st]) => st.status === 'aprobada'
                );
                const lastApproved = approvedStages[approvedStages.length - 1];

                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {r.code ? `${r.code} · ` : ''}
                        {r.nombreApellido ||
                          [r.nombre, r.apellido].filter(Boolean).join(' ') ||
                          r.id}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.empresa || 'Sin empresa'}
                        {r.ciudad ? ` · ${r.ciudad}` : ''}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground text-right">
                      {pendingStages.length > 0
                        ? `${pendingStages.length} en revisión`
                        : lastApproved
                        ? getSectionTitle(lastApproved[0])
                        : 'Sin etapas'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
