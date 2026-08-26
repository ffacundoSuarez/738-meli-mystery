'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { setResultadosCredentials } from '@/lib/resultados-auth';

function readCredentials(state: { username: string; password: string }) {
  const usernameEl =
    typeof document !== 'undefined'
      ? (document.getElementById('resultados-username') as HTMLInputElement | null)
      : null;
  const passwordEl =
    typeof document !== 'undefined'
      ? (document.getElementById('resultados-password') as HTMLInputElement | null)
      : null;

  return {
    username: (state.username || usernameEl?.value || '').trim(),
    password: state.password || passwordEl?.value || '',
  };
}

export default function ResultadosAccesoForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/resultados';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [canSubmit, setCanSubmit] = useState(false);
  const [loading, setLoading] = useState(false);

  const syncFields = useCallback((user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    setCanSubmit(user.trim().length > 0 && pass.length > 0);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const creds = readCredentials({ username, password });
    if (!creds.username || !creds.password) {
      toast.error('Ingresá usuario y contraseña');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/resultados/acceso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Usuario o contraseña incorrectos');
        return;
      }

      setResultadosCredentials(creds.username, creds.password);
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
          <CardTitle>Acceso a resultados</CardTitle>
          <CardDescription>
            Ingresá tu email y contraseña para ver los resultados del estudio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resultados-username">Email</Label>
              <Input
                id="resultados-username"
                name="username"
                type="email"
                autoComplete="username"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="tu.email@mercadolibre.com"
                value={username}
                onChange={(e) => syncFields(e.target.value, password)}
                onInput={(e) => syncFields(e.currentTarget.value, password)}
                className="text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resultados-password">Contraseña</Label>
              <Input
                id="resultados-password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => syncFields(username, e.target.value)}
                onInput={(e) => syncFields(username, e.currentTarget.value)}
                className="text-base"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !canSubmit}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Ingresar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
