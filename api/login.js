import { createSessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from '../src/server/session.js';
import { json, readForm, safeEqual } from '../src/server/vercel-api.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    json(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const { LIVEIT_USERNAME: username, LIVEIT_PASSWORD: password, LIVEIT_SESSION_SECRET: secret } = process.env;
  if (!username || !password || !secret || secret.length < 32) {
    json(res, 503, { error: 'Sign-in is not configured. Set LIVEIT_USERNAME, LIVEIT_PASSWORD, and a 32-character LIVEIT_SESSION_SECRET in Vercel.' });
    return;
  }

  let form;
  try {
    form = readForm(req);
  } catch {
    json(res, 413, { error: 'Request is too large.' });
    return;
  }

  if (!safeEqual(form.get('username') || '', username) || !safeEqual(form.get('password') || '', password)) {
    json(res, 401, { error: 'That username and password do not match.' });
    return;
  }

  const token = await createSessionToken(secret);
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket?.encrypted ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secure}`);
  json(res, 200, { ok: true });
}
