'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getProductosEvaluados } from '@/lib/data';
import { CATEGORIAS, PAISES } from '@/lib/survey-config/constants';
import { ProductoEvaluado } from '@/lib/types';
import { Search, MapPin, Filter, Loader2, Package } from 'lucide-react';
import { toast } from 'sonner';

/** Resuelve el label legible de A10 (incluye respuestas legacy con código 97). */
function categoriaLabel(row: ProductoEvaluado): string {
  const code = row.categoria;
  if (!code) return '-';
  if (code === '97') {
    return row.categoriaOtra?.trim() || 'Otros (especificar)';
  }
  return CATEGORIAS.find((c) => c.value === code)?.label ?? code;
}

function paisLabel(code: string | undefined): string {
  if (!code) return '-';
  return PAISES.find((p) => p.value === code)?.label ?? code;
}

export default function ProductosEvaluadosPage() {
  const [productos, setProductos] = useState<ProductoEvaluado[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPais, setFilterPais] = useState('all');
  const [filterCategoria, setFilterCategoria] = useState('all');

  useEffect(() => {
    (async () => {
      try {
        setProductos(await getProductosEvaluados());
      } catch {
        toast.error('Error al cargar productos evaluados');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return productos.filter((row) => {
      const cat = categoriaLabel(row);
      const titulo = (row.tituloPublicacion ?? '').toLowerCase();
      const matchesSearch =
        term === '' ||
        row.producto.toLowerCase().includes(term) ||
        titulo.includes(term) ||
        cat.toLowerCase().includes(term);
      const matchesPais = filterPais === 'all' || row.pais === filterPais;
      const matchesCategoria =
        filterCategoria === 'all' || row.categoria === filterCategoria;
      return matchesSearch && matchesPais && matchesCategoria;
    });
  }, [productos, searchTerm, filterPais, filterCategoria]);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Package className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">Mystery Shopper</h1>
              <p className="text-xs text-muted-foreground">Productos ya evaluados</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Productos evaluados</h2>
          <p className="text-muted-foreground">
            {loading
              ? 'Cargando...'
              : `${filtered.length} de ${productos.length} registro${productos.length !== 1 ? 's' : ''}`}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Consultá acá antes de comprar para evitar duplicados.
          </p>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por producto, título o categoría..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterPais} onValueChange={setFilterPais}>
                <SelectTrigger className="w-full sm:w-44">
                  <MapPin className="w-4 h-4 mr-2" />
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
              <Select value={filterCategoria} onValueChange={setFilterCategoria}>
                <SelectTrigger className="w-full sm:w-56">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {CATEGORIAS.map((c) => (
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
                No hay productos con los filtros seleccionados.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left p-4 font-medium">País</th>
                      <th className="text-left p-4 font-medium">Producto</th>
                      <th className="text-left p-4 font-medium">
                        Título de la publicación
                      </th>
                      <th className="text-left p-4 font-medium">Categoría</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row, index) => (
                      <tr
                        key={`${row.pais}-${row.producto}-${row.tituloPublicacion ?? ''}-${row.categoria}-${index}`}
                        className="border-b last:border-0 hover:bg-muted/20"
                      >
                        <td className="p-4">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                            {paisLabel(row.pais)}
                          </span>
                        </td>
                        <td className="p-4">{row.producto}</td>
                        <td className="p-4 max-w-md">
                          {row.tituloPublicacion?.trim() || (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="p-4">{categoriaLabel(row)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
