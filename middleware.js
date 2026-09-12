import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Allow access to login page, auth API routes, and inbound email webhook
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/inbound-email') ||
    pathname.startsWith('/api/quick-capture') ||
    pathname.startsWith('/api/capture/') ||
    pathname.startsWith('/api/applaud-webhook') ||
    pathname.startsWith('/api/pebble-webhook') ||     // Pebble Index Hold & Talk; the route checks the bearer itself
    pathname.startsWith('/api/pebble/') ||            // phone pull of Pebble memos (pending/audio/ack); requireAuth inside
    pathname.startsWith('/api/tasks') ||              // every handler calls requireAuth (session or bearer); the phone's
                                                      // Triage PATCH/DELETE must not depend on a web-login cookie
    pathname.startsWith('/api/contacts') ||           // the phone's People screen (list / add / alias); requireAuth inside
    pathname.startsWith('/api/github/issue-resolved') ||
    pathname.startsWith('/api/cron/')
  ) {
    return NextResponse.next();
  }

  // Check for valid session token
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // If no token and trying to access protected route, redirect to login
  if (!token) {
    // For API routes, return 401
    if (pathname.startsWith('/api/')) {
      return new NextResponse(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    // For pages, redirect to login
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protect all routes except static files and _next
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
