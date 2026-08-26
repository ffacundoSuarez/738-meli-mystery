import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import {
  normalizeResultadosUsername,
  RESULTADOS_AUTH_COOKIE,
} from '@/lib/resultados-auth';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 días

/** Valida credenciales cliente vía RPC (anon) y setea cookie de sesión. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Usuario y contraseña requeridos' },
        { status: 400 }
      );
    }

    const { data: valid, error } = await supabase.rpc('meli_validate_resultados_client', {
      p_username: username,
      p_password: password,
    });

    if (error) {
      console.error('[resultados/acceso] RPC error:', error.message);
      return NextResponse.json(
        { error: 'Error al validar el acceso' },
        { status: 500 }
      );
    }

    if (!valid) {
      return NextResponse.json(
        { error: 'Usuario o contraseña incorrectos' },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(RESULTADOS_AUTH_COOKIE, normalizeResultadosUsername(username), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    });
    return response;
  } catch (err) {
    console.error('[resultados/acceso] POST error:', err);
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
  }
}

/** Cierra sesión cliente /resultados. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(RESULTADOS_AUTH_COOKIE, '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
  });
  return response;
}
