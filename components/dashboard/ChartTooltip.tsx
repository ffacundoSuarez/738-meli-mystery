'use client';

export const PIE_COLORS = [
  '#FFDE00',
  '#22c55e',
  '#3b82f6',
  '#f59e0b',
  '#ef4444',
  '#a855f7',
  '#06b6d4',
];

/** Colores para estados de etapa (barras apiladas). */
export const STAGE_STACK_COLORS = {
  pendiente: '#94a3b8',
  en_revision: '#f59e0b',
  aprobada: '#22c55e',
  rechazada: '#ef4444',
};

/** Colores para series de categoría y canal. */
export const CATEGORIA_COLORS = {
  Hogares: '#3b82f6',
  Negocios: '#06b6d4',
};

export const CANAL_COLORS = {
  Telefónico: '#a855f7',
  Presencial: '#f59e0b',
};

/** Palette estable por nombre de país (marca × país, etc.). */
export const PAIS_COLORS: Record<string, string> = {
  Argentina: '#FFDE00',
  Colombia: '#22c55e',
  Perú: '#3b82f6',
  Chile: '#f59e0b',
  Paraguay: '#ef4444',
  Uruguay: '#a855f7',
  Portugal: '#06b6d4',
  Alemania: '#64748b',
};

type TooltipPayloadItem = {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: { name?: string; fill?: string };
};

/**
 * Tooltip custom de Recharts: recuadro blanco con sombra, título y series
 * con color del trazo/barra (el contentStyle nativo falla con variables oklch).
 */
export function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;

  const title =
    label != null && String(label) !== ''
      ? String(label)
      : payload[0]?.payload?.name || payload[0]?.name;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-lg min-w-[150px]">
      {title && (
        <p className="mb-1.5 border-b border-slate-100 pb-1.5 text-sm font-semibold text-slate-900">
          {title}
        </p>
      )}
      <ul className="space-y-1">
        {payload.map((entry, i) => {
          const color = entry.color || entry.payload?.fill || '#64748b';
          const name = entry.name ?? String(entry.dataKey ?? 'Valor');
          // En pie el nombre ya es el título; no lo repetimos
          const hideName = payload.length === 1 && name === title;
          return (
            <li key={i} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {!hideName && (
                  <span className="truncate text-slate-500">{name}</span>
                )}
              </span>
              <span className="font-bold tabular-nums" style={{ color }}>
                {entry.value}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
