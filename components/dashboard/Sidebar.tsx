'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  ClipboardCheck,
  UserPlus,
  BarChart3,
  ExternalLink,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Postulantes', href: '/dashboard/postulantes', icon: UserPlus },
  { name: 'Revisión', href: '/dashboard/revision', icon: ClipboardCheck },
  { name: 'Estadísticas', href: '/dashboard/estadisticas', icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center h-16 px-6 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <span className="text-sidebar-primary-foreground font-bold text-sm">ML</span>
          </div>
          <span className="font-semibold text-lg text-sidebar-foreground">Mystery Shopper ML</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <div className="p-4 rounded-lg bg-sidebar-accent/50">
          <div className="flex items-center gap-2 mb-2">
            <ExternalLink className="w-4 h-4 text-sidebar-foreground/70" />
            <span className="text-sm font-medium">Vista del cliente</span>
          </div>
          <p className="text-xs text-sidebar-foreground/60 mb-3">
            Resultados públicos para el cliente
          </p>
          <Link
            href="/resultados"
            target="_blank"
            className="block w-full text-center text-xs bg-sidebar-primary text-sidebar-primary-foreground py-2 px-3 rounded-md hover:opacity-90 transition-opacity"
          >
            Abrir /resultados
          </Link>
        </div>
      </div>
    </aside>
  );
}
