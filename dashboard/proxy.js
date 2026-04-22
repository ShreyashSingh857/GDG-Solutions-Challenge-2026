import { NextResponse } from 'next/server';

const STATIC_FILE = /\.(?:png|jpg|jpeg|svg|gif|ico|webp|css|js|map|txt)$/i;

export function proxy(req) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/onboarding') ||
    pathname === '/favicon.ico' ||
    STATIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  if (process.env.AUTH_REQUIRED !== 'true') {
    return NextResponse.next();
  }

  const session = req.cookies.get('__session')?.value || req.cookies.get('gdg_session')?.value;
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
