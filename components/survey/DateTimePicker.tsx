'use client';

import { CalendarDays, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface DateTimePickerProps {
  /** Valor combinado en formato "YYYY-MM-DDTHH:mm" (compatible con datetime-local) */
  value: string;
  onChange: (value: string) => void;
  dateLabel?: string;
  timeLabel?: string;
}

/**
 * Selector de fecha y hora amigable: divide el valor en dos campos
 * (Fecha y Hora) con íconos, en vez del control nativo datetime-local.
 */
export function DateTimePicker({
  value,
  onChange,
  dateLabel = 'Fecha',
  timeLabel = 'Hora',
}: DateTimePickerProps) {
  // El valor se guarda como "fechaThora"; lo separamos para cada campo
  const [datePart = '', timePart = ''] = (value || '').split('T');

  // Recompone el valor manteniendo la 'T' para que el parseo sea estable
  const update = (nextDate: string, nextTime: string) => {
    if (!nextDate && !nextTime) {
      onChange('');
      return;
    }
    onChange(`${nextDate}T${nextTime}`);
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="flex-1 space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">{dateLabel}</span>
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="date"
            className="pl-10"
            value={datePart}
            onChange={(e) => update(e.target.value, timePart)}
          />
        </div>
      </div>
      <div className="flex-1 space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">{timeLabel}</span>
        <div className="relative">
          <Clock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="time"
            className="pl-10"
            value={timePart}
            onChange={(e) => update(datePart, e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
