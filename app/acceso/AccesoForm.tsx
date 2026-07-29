'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setOpsPasscode } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';

/** Lee el valor del input (estado React + DOM por si el móvil no disparó onChange) */
function readPasscode(state: string): string {
  const fromDom =
    typeof document !== 'undefined'
      ? (document.getElementById('passcode') as HTMLInputElement | null)?.value ?? ''
      : '';
  return (state || fromDom).trim();
}

export default function AccesoForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/dashboard';
  const [passcode, setPasscode] = useState('');
  const [canSubmit, setCanSubmit] = useState(false);
  const [loading, setLoading] = useState(false);

  const syncPasscode = useCallback((raw: string) => {
    setPasscode(raw);
    setCanSubmit(raw.trim().length > 0);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = readPasscode(passcode);
    if (!value) {
      toast.error('Ingresá la clave de operaciones');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/acceso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: value }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Passcode incorrecto');
        return;
      }

      setOpsPasscode(value);
      router.push(redirect);
    } catch {
      toast.error('Error al validar el acceso');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-background to-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Acceso interno</CardTitle>
          <CardDescription>
            Ingresá la clave de operaciones para acceder al panel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="passcode">Clave de acceso</Label>
              <Input
                id="passcode"
                name="passcode"
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Clave de operaciones"
                value={passcode}
                onChange={(e) => syncPasscode(e.target.value)}
                onInput={(e) => syncPasscode(e.currentTarget.value)}
                className="text-base"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading || !canSubmit}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Ingresar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
