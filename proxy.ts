import { NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE = 'meli_auth';

// Protege /dashboard/* — requiere cookie de sesión ops
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/dashboard')) {
    const auth = request.cookies.get(AUTH_COOKIE)?.value;
    if (auth !== '1') {
      const loginUrl = new URL('/acceso', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
