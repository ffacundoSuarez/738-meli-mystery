import { NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE = 'meli_auth';

// Valida passcode y setea cookie de sesión ops
export async function POST(request: NextRequest) {
  try {
    const { passcode } = await request.json();
    const expected = process.env.INTERNAL_PASSCODE;

    if (!expected) {
      return NextResponse.json(
        { error: 'INTERNAL_PASSCODE no configurado en el servidor' },
        { status: 500 }
      );
    }

    if (passcode !== expected) {
      return NextResponse.json({ error: 'Passcode incorrecto' }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(AUTH_COOKIE, '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 días
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
  }
}

// Cierra sesión ops
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}
