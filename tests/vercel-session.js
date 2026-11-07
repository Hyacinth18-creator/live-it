import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken, hasValidSession, SESSION_TTL_SECONDS } from '../src/server/session.js';
import login from '../api/login.js';
import logout from '../api/logout.js';
import ai from '../api/ai.js';
import proxy from '../proxy.js';

const SECRET = 'a-vercel-session-secret-with-at-least-32-characters';

function response() {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    end(body = '') { this.body = body; },
  };
}

function restoreEnvironment(previous) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test('Vercel login, protected routes, AI configuration, and logout', async () => {
  const env = ['LIVEIT_USERNAME', 'LIVEIT_PASSWORD', 'LIVEIT_SESSION_SECRET', 'OLLAMA_URL']
    .map((key) => [key, process.env[key]]);
  process.env.LIVEIT_USERNAME = 'liveit-test';
  process.env.LIVEIT_PASSWORD = 'local-test-password';
  process.env.LIVEIT_SESSION_SECRET = SECRET;
  delete process.env.OLLAMA_URL;

  try {
    const loginPage = await proxy(new Request('https://live-it.example/'));
    assert.equal(loginPage.headers.get('x-middleware-rewrite'), 'https://live-it.example/login.html');

    const privateAsset = await proxy(new Request('https://live-it.example/src/app.js'));
    assert.equal(privateAsset.status, 401);

    const rejected = response();
    await login({ method: 'POST', headers: {}, body: { username: 'liveit-test', password: 'wrong' } }, rejected);
    assert.equal(rejected.statusCode, 401);

    const accepted = response();
    await login({
      method: 'POST',
      headers: { 'x-forwarded-proto': 'https' },
      body: { username: 'liveit-test', password: 'local-test-password' },
    }, accepted);
    assert.equal(accepted.statusCode, 200);
    assert.match(accepted.headers['set-cookie'], /HttpOnly; SameSite=Strict; Path=\/; Max-Age=28800; Secure/);
    const cookie = accepted.headers['set-cookie'].split(';')[0];
    assert.equal(await hasValidSession(cookie, SECRET), true);

    const protectedAsset = await proxy(new Request('https://live-it.example/src/app.js', { headers: { cookie } }));
    assert.equal(protectedAsset.headers.get('x-middleware-next'), '1');

    const unauthenticatedAi = response();
    await ai({ method: 'POST', headers: {}, body: { messages: [{ role: 'user', content: 'hello' }] } }, unauthenticatedAi);
    assert.equal(unauthenticatedAi.statusCode, 401);

    const unconfiguredAi = response();
    await ai({
      method: 'POST',
      headers: { cookie },
      body: { messages: [{ role: 'user', content: 'hello' }] },
    }, unconfiguredAi);
    assert.equal(unconfiguredAi.statusCode, 503);
    assert.match(unconfiguredAi.body, /OLLAMA_URL/);

    const signedOut = response();
    logout({ method: 'POST', headers: { 'x-forwarded-proto': 'https' } }, signedOut);
    assert.equal(signedOut.statusCode, 200);
    assert.match(signedOut.headers['set-cookie'], /Max-Age=0/);
  } finally {
    restoreEnvironment(env);
  }
});

test('signed sessions reject expired, altered, and malformed cookies', async () => {
  const now = 1_800_000_000_000;
  const token = await createSessionToken(SECRET, now);
  assert.equal(await hasValidSession(`liveit_session=${token}`, SECRET, now), true);
  assert.equal(await hasValidSession(`liveit_session=${token}`, SECRET, now + SESSION_TTL_SECONDS * 1000), false);
  assert.equal(await hasValidSession(`liveit_session=${token}x`, SECRET, now), false);
  assert.equal(await hasValidSession('liveit_session=bad.token.value', SECRET, now), false);
});
