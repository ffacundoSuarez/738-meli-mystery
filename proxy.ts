import { NextRequest, NextResponse } from 'next/server';

const OPS_AUTH_COOKIE = 'meli_auth';
const RESULTADOS_AUTH_COOKIE = 'meli_resultados_auth';

// Protege /dashboard/* (Ops) y /resultados/* (clientes)
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/dashboard')) {
    const auth = request.cookies.get(OPS_AUTH_COOKIE)?.value;
    if (auth !== '1') {
      const loginUrl = new URL('/acceso', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (pathname.startsWith('/resultados') && pathname !== '/resultados/acceso') {
    const opsAuth = request.cookies.get(OPS_AUTH_COOKIE)?.value;
    const clientAuth = request.cookies.get(RESULTADOS_AUTH_COOKIE)?.value;
    if (opsAuth !== '1' && !clientAuth) {
      const loginUrl = new URL('/resultados/acceso', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/resultados', '/resultados/:path*'],
};
