import { NextRequest, NextResponse } from 'next/server';

const OPS_AUTH_COOKIE = 'meli_auth';

/** Restaura passcode en localStorage cuando Ops abrió /resultados en pestaña nueva. */
export async function GET(request: NextRequest) {
  const opsAuth = request.cookies.get(OPS_AUTH_COOKIE)?.value;
  if (opsAuth !== '1') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const passcode = process.env.INTERNAL_PASSCODE;
  if (!passcode) {
    return NextResponse.json(
      { error: 'INTERNAL_PASSCODE no configurado en el servidor' },
      { status: 500 }
    );
  }

  return NextResponse.json({ passcode });
}
