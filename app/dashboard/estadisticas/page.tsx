'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { adminListResponsesSummary } from '@/lib/data';
import { getSectionTitle, REVIEWABLE_SECTIONS } from '@/lib/survey-config';
import { PAISES } from '@/lib/survey-config/constants';
import { getScreeningSnapshot, hasAnsweredFirstStage } from '@/lib/survey-snapshot';
import { SurveyResponse } from '@/lib/types';
import {
  ChartTooltip,
  PIE_COLORS,
  STAGE_STACK_COLORS,
} from '@/components/dashboard/ChartTooltip';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import { Loader2 } from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  borrador: 'Borrador',
  en_revision: 'En revisión',
  publicado: 'Publicado',
  rechazado: 'Rechazado',
};

/** Counts occurrences of a label key across a list of string values. */
function countByLabel(values: (string | undefined)[], fallback = 'Sin dato') {
  const map = new Map<string, number>();
  for (const raw of values) {
    const k = raw || fallback;
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export default function EstadisticasPage() {
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  /** "all" = vista general; otherwise país code from PAISES. */
  const [filterPais, setFilterPais] = useState('all');

  useEffect(() => {
    (async () => {
      try {
        setResponses(await adminListResponsesSummary());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /**
   * Base de todas las estadísticas: encuestas reales (no prueba) que fueron
   * contestadas en la primera etapa (Parte 1 enviada). Los links generados
   * sin responder no se cuentan.
   */
  const realResponses = useMemo(
    () => responses.filter((r) => !r.isPrueba && hasAnsweredFirstStage(r.stages)),
    [responses]
  );

  /** Responses filtered by país select (Gráfico 3 and related). */
  const countryScoped = useMemo(() => {
    if (filterPais === 'all') return realResponses;
    return realResponses.filter(
      (r) => getScreeningSnapshot(r.answers).paisCode === filterPais
    );
  }, [realResponses, filterPais]);

  const byEmpresa = useMemo(() => {
    return countByLabel(realResponses.map((r) => r.empresa), 'Sin empresa');
  }, [realResponses]);

  const byStatus = useMemo(() => {
    return countByLabel(
      realResponses.map((r) => STATUS_LABELS[r.status] || r.status)
    );
  }, [realResponses]);

  const byEtapa = useMemo(() => {
    return countByLabel(
      realResponses.map((r) => {
        const raw = r.ultimaEtapa || (r.answers['ultima-etapa'] as string | undefined);
        return raw ? getSectionTitle(raw) : 'Sin etapa';
      })
    );
  }, [realResponses]);

  /** Gráfico 1: encuestas contestadas por país. */
  const byPais = useMemo(() => {
    return countByLabel(
      realResponses.map((r) => getScreeningSnapshot(r.answers).pais),
      'Sin país'
    );
  }, [realResponses]);

  /**
   * Gráfico 2: casos por etapas — una barra por parte con estados apilados.
   * Cada etapa cuenta cuántas encuestas tienen ese status en esa parte.
   */
  const byEtapaStatus = useMemo(() => {
    return REVIEWABLE_SECTIONS.map((sectionId) => {
      const row: Record<string, string | number> = {
        name: getSectionTitle(sectionId).replace(/^Parte\s+/i, 'P'),
      };
      let pendiente = 0;
      let en_revision = 0;
      let aprobada = 0;
      let rechazada = 0;
      for (const r of realResponses) {
        const st = r.stages?.[sectionId]?.status;
        if (st === 'pendiente') pendiente++;
        else if (st === 'en_revision') en_revision++;
        else if (st === 'aprobada') aprobada++;
        else if (st === 'rechazada') rechazada++;
        else pendiente++; // sin stage iniciada cuenta como pendiente
      }
      row.pendiente = pendiente;
      row.en_revision = en_revision;
      row.aprobada = aprobada;
      row.rechazada = rechazada;
      return row;
    });
  }, [realResponses]);

  /** Gráfico 3a: Hogares vs Negocios (filtro país). */
  const byCategoria = useMemo(() => {
    return countByLabel(
      countryScoped.map((r) => getScreeningSnapshot(r.answers).categoria),
      'Sin categoría'
    );
  }, [countryScoped]);

  /** Gráfico 3b: Telefónico vs Presencial (filtro país). */
  const byCanal = useMemo(() => {
    return countByLabel(
      countryScoped.map((r) => getScreeningSnapshot(r.answers).canal),
      'Sin canal'
    );
  }, [countryScoped]);

  /** Por marca. */
  const byMarca = useMemo(() => {
    return countByLabel(
      realResponses.map((r) => getScreeningSnapshot(r.answers).marca),
      'Sin marca'
    );
  }, [realResponses]);

  /** Tendencia temporal: encuestas creadas por mes. */
  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of realResponses) {
      const d = new Date(r.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => ({ name, value }));
  }, [realResponses]);

  /**
   * Embudo de completitud: cuántas encuestas llegaron al menos a cada parte
   * (cualquier status distinto de pendiente / ausente).
   */
  const funnel = useMemo(() => {
    return REVIEWABLE_SECTIONS.map((sectionId) => {
      let reached = 0;
      for (const r of realResponses) {
        const st = r.stages?.[sectionId]?.status;
        if (st && st !== 'pendiente') reached++;
      }
      return {
        name: getSectionTitle(sectionId).replace(/^Parte\s+/i, 'Parte '),
        value: reached,
      };
    });
  }, [realResponses]);

  /** Tasa de aprobación global de etapas. */
  const stageStats = useMemo(() => {
    let pending = 0;
    let inReview = 0;
    let approved = 0;
    let rejected = 0;
    for (const r of realResponses) {
      for (const st of Object.values(r.stages || {})) {
        if (st.status === 'pendiente') pending++;
        else if (st.status === 'en_revision') inReview++;
        else if (st.status === 'aprobada') approved++;
        else if (st.status === 'rechazada') rejected++;
      }
    }
    return { pending, inReview, approved, rejected };
  }, [realResponses]);

  /** Aprobadas vs rechazadas por país (etapas, no encuestas). */
  const approvalByPais = useMemo(() => {
    const map = new Map<string, { name: string; aprobadas: number; rechazadas: number }>();
    for (const r of realResponses) {
      const snapshot = getScreeningSnapshot(r.answers);
      const name = snapshot.pais || 'Sin país';
      if (!map.has(name)) map.set(name, { name, aprobadas: 0, rechazadas: 0 });
      const row = map.get(name)!;
      for (const st of Object.values(r.stages || {})) {
        if (st.status === 'aprobada') row.aprobadas++;
        else if (st.status === 'rechazada') row.rechazadas++;
      }
    }
    return [...map.values()].sort(
      (a, b) => b.aprobadas + b.rechazadas - (a.aprobadas + a.rechazadas)
    );
  }, [realResponses]);

  const countryLabel =
    filterPais === 'all'
      ? 'todos los países'
      : PAISES.find((p) => p.value === filterPais)?.label || 'país';

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (realResponses.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Estadísticas</h1>
          <p className="text-muted-foreground">
            Análisis de las encuestas contestadas (Parte 1 enviada)
          </p>
        </div>
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Todavía no hay encuestas contestadas para mostrar.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Estadísticas</h1>
        <p className="text-muted-foreground">
          Análisis de las encuestas contestadas (Parte 1 enviada)
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Encuestas contestadas', value: realResponses.length },
          { label: 'Etapas en revisión', value: stageStats.inReview },
          { label: 'Etapas aprobadas', value: stageStats.approved },
          { label: 'Etapas rechazadas', value: stageStats.rejected },
        ].map((m) => (
          <Card key={m.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {m.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{m.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Gráfico 1: Encuestas por país */}
        <Card>
          <CardHeader>
            <CardTitle>Encuestas por país</CardTitle>
            <CardDescription>Cantidad de encuestas contestadas por país</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byPais} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={100} />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'rgba(15, 23, 42, 0.05)' }}
                    wrapperStyle={{ outline: 'none' }}
                  />
                  <Bar dataKey="value" name="Encuestas" fill="#FFDE00" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Gráfico 2: Casos por etapas (apilado) */}
        <Card>
          <CardHeader>
            <CardTitle>Casos por etapas</CardTitle>
            <CardDescription>Estado de cada parte (aprobada, en revisión, etc.)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byEtapaStatus}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'rgba(15, 23, 42, 0.05)' }}
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
                  />
                  <Bar
                    dataKey="pendiente"
                    name="Pendiente"
                    stackId="a"
                    fill={STAGE_STACK_COLORS.pendiente}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Gráfico 3: Categoría + Canal con selector de país */}
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <CardTitle>Hogares / Negocios y Canal</CardTitle>
              <CardDescription>
                Vista general o filtrada por país — mostrando {countryLabel} (
                {countryScoped.length} encuesta{countryScoped.length !== 1 ? 's' : ''})
              </CardDescription>
            </div>
            <Select value={filterPais} onValueChange={setFilterPais}>
              <SelectTrigger className="h-9 w-full sm:w-48">
                <SelectValue placeholder="País" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">General (todos)</SelectItem>
                {PAISES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="text-sm font-medium mb-2 text-muted-foreground">
                  Categoría (Hogares / Negocios)
                </p>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byCategoria}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" />
                      <YAxis allowDecimals={false} />
                      <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'rgba(15, 23, 42, 0.05)' }}
                    wrapperStyle={{ outline: 'none' }}
                  />
                      <Bar dataKey="value" name="Encuestas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2 text-muted-foreground">
                  Canal (Telefónico / Presencial)
                </p>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byCanal}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" />
                      <YAxis allowDecimals={false} />
                      <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'rgba(15, 23, 42, 0.05)' }}
                    wrapperStyle={{ outline: 'none' }}
                  />
                      <Bar dataKey="value" name="Encuestas" fill="#a855f7" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Por marca */}
        <Card>
          <CardHeader>
            <CardTitle>Por marca</CardTitle>
            <CardDescription>Distribución de encuestas por marca evaluada</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byMarca} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={110} />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'rgba(15, 23, 42, 0.05)' }}
                    wrapperStyle={{ outline: 'none' }}
                  />
                  <Bar dataKey="value" name="Encuestas" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Embudo de completitud */}
        <Card>
          <CardHeader>
            <CardTitle>Embudo de completitud</CardTitle>
            <CardDescription>
              Encuestas que llegaron al menos a cada parte (enviadas / en revisión / cerradas)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnel}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'rgba(15, 23, 42, 0.05)' }}
                    wrapperStyle={{ outline: 'none' }}
                  />
                  <Bar dataKey="value" name="Llegaron" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Tendencia por mes */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Encuestas por mes</CardTitle>
            <CardDescription>Tendencia temporal de creación de encuestas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {byMonth.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-16">Sin fechas</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={byMonth}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'rgba(15, 23, 42, 0.05)' }}
                    wrapperStyle={{ outline: 'none' }}
                  />
                    <Line
                      type="monotone"
                      dataKey="value"
                      name="Encuestas"
                      stroke="#FFDE00"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tasa de aprobación por país */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Aprobadas vs rechazadas por país</CardTitle>
            <CardDescription>Cantidad de etapas aprobadas y rechazadas agrupadas por país</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={approvalByPais}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'rgba(15, 23, 42, 0.05)' }}
                    wrapperStyle={{ outline: 'none' }}
                  />
                  <Legend />
                  <Bar dataKey="aprobadas" name="Aprobadas" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="rechazadas" name="Rechazadas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Gráficos existentes mantenidos */}
        <Card>
          <CardHeader>
            <CardTitle>Formularios por Empresa</CardTitle>
            <CardDescription>Cantidad de procesos por empresa/sucursal</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byEmpresa} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={100} />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'rgba(15, 23, 42, 0.05)' }}
                    wrapperStyle={{ outline: 'none' }}
                  />
                  <Bar dataKey="value" name="Formularios" fill="#FFDE00" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Por Estado Global</CardTitle>
            <CardDescription>Estado general de cada encuesta</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) =>
                      `${name} ${((percent || 0) * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {byStatus.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'rgba(15, 23, 42, 0.05)' }}
                    wrapperStyle={{ outline: 'none' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Por Última Etapa Alcanzada</CardTitle>
            <CardDescription>Hasta dónde llegó cada mystery shopper</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byEtapa}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: 'rgba(15, 23, 42, 0.05)' }}
                    wrapperStyle={{ outline: 'none' }}
                  />
                  <Bar dataKey="value" name="Formularios" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
