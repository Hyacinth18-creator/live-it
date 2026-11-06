// Zero-dependency static server for Live It. The camera API needs a secure context: http://localhost is one.
//   node server.mjs [port]      ->  http://localhost:5173
import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));

async function loadLocalEnvironment() {
  const contents = await readFile(join(ROOT, '.env'), 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  for (const line of contents.split(/\r?\n/)) {
    const entry = line.trim();
    if (!entry || entry.startsWith('#')) continue;
    const separator = entry.indexOf('=');
    if (separator < 1) continue;
    const key = entry.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key]) continue;
    let value = entry.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

await loadLocalEnvironment();
const PORT = Number(process.argv[2] || process.env.PORT || 5173);
const USERNAME = process.env.LIVEIT_USERNAME || '';
const PASSWORD = process.env.LIVEIT_PASSWORD || '';
const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const SESSION_COOKIE = 'liveit_session';
const SESSION_TTL = 8 * 60 * 60 * 1000;
const sessions = new Map();
const publicFiles = new Set(['/login.html', '/auth.js', '/styles.css', '/favicon.svg', '/docs/preview.png']);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.task': 'application/octet-stream',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.map': 'application/json',
};

function safeEqual(actual, expected) {
  const actualHash = createHash('sha256').update(actual).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}

function sessionFrom(req) {
  const cookie = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  const token = cookie?.slice(SESSION_COOKIE.length + 1);
  const session = token && sessions.get(token);
  if (!session) return false;
  if (session.expires <= Date.now()) { sessions.delete(token); return false; }
  return true;
}

function setSessionCookie(req, res, token, maxAge) {
  const secure = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`);
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

async function readForm(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 4096) throw new Error('request too large');
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

async function readJson(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 16_384) throw new Error('request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith('/.env')) { res.writeHead(404).end('not found'); return; }

    if (pathname === '/api/login' && req.method === 'POST') {
      if (!USERNAME || !PASSWORD) {
        json(res, 503, { error: 'Sign-in is not configured. Copy .env.example to .env, set your account details, and restart the server.' });
        return;
      }
      let form;
      try { form = await readForm(req); } catch { json(res, 413, { error: 'Request is too large.' }); return; }
      if (!safeEqual(form.get('username') || '', USERNAME) || !safeEqual(form.get('password') || '', PASSWORD)) {
        json(res, 401, { error: 'That username and password do not match.' }); return;
      }
      const token = randomBytes(32).toString('base64url');
      sessions.set(token, { expires: Date.now() + SESSION_TTL });
      setSessionCookie(req, res, token, SESSION_TTL / 1000);
      json(res, 200, { ok: true });
      return;
    }

    if (pathname === '/api/logout' && req.method === 'POST') {
      const cookie = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
      if (cookie) sessions.delete(cookie.slice(SESSION_COOKIE.length + 1));
      setSessionCookie(req, res, '', 0);
      json(res, 200, { ok: true });
      return;
    }

    const authenticated = sessionFrom(req);
    if (authenticated && (pathname === '/login' || pathname === '/login.html')) {
      res.writeHead(303, { Location: '/' }).end();
      return;
    }
    if (!authenticated && pathname !== '/' && pathname !== '/login' && pathname !== '/login.html' && !publicFiles.has(pathname)) {
      res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('authentication required');
      return;
    }

    if (pathname === '/api/ai' && req.method === 'POST') {
      let payload;
      try { payload = await readJson(req); } catch { json(res, 400, { error: 'Invalid or oversized request.' }); return; }
      const messages = Array.isArray(payload.messages) ? payload.messages.slice(-12).filter((message) =>
        ['user', 'assistant'].includes(message?.role) && typeof message.content === 'string').map((message) => ({
        role: message.role,
        content: message.content.slice(0, 4000),
      })) : [];
      if (!messages.length || messages.at(-1).role !== 'user') { json(res, 400, { error: 'Ask a question to start the conversation.' }); return; }
      try {
        const response = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: false }),
          signal: AbortSignal.timeout(90_000),
        });
        if (!response.ok) { json(res, 502, { error: `Ollama returned ${response.status}. Check the local model service.` }); return; }
        const result = await response.json();
        json(res, 200, { answer: result.message?.content || '', model: OLLAMA_MODEL });
      } catch {
        json(res, 503, { error: 'Cannot reach Ollama. Start Ollama and make sure the selected model is installed.' });
      }
      return;
    }

    let path = normalize(join(ROOT, !authenticated && (pathname === '/' || pathname === '/login') ? 'login.html' : pathname));
    if (!path.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
    if ((await stat(path).catch(() => null))?.isDirectory()) path = join(path, 'index.html');
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': TYPES[extname(path).toLowerCase()] || 'application/octet-stream', 'Cache-Control': authenticated ? 'no-cache' : 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
  }
}).listen(PORT, () => {
  console.log(`Live It running at http://localhost:${PORT}`);
  if (!USERNAME || !PASSWORD) console.warn('Sign-in is disabled. Copy .env.example to .env, set credentials, and restart the server.');
});
