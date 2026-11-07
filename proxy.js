import { next, rewrite } from '@vercel/functions';
import { hasValidSession } from './src/server/session.js';

const publicFiles = new Set(['/login.html', '/auth.js', '/styles.css', '/favicon.svg', '/docs/preview.png']);

export default async function proxy(request) {
  const { pathname } = new URL(request.url);
  if (pathname.startsWith('/api/')) return next();
  if (pathname.startsWith('/.env')) return new Response('not found', { status: 404 });

  const authenticated = await hasValidSession(
    request.headers.get('cookie'),
    process.env.LIVEIT_SESSION_SECRET,
  );
  if (authenticated && (pathname === '/login' || pathname === '/login.html')) {
    return Response.redirect(new URL('/', request.url), 303);
  }
  if (!authenticated && (pathname === '/' || pathname === '/login')) {
    return rewrite(new URL('/login.html', request.url));
  }
  if (!authenticated && !publicFiles.has(pathname)) {
    return new Response('authentication required', {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  return next();
}
