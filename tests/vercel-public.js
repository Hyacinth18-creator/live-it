import assert from 'node:assert/strict';
import test from 'node:test';
import ai from '../api/ai.js';

function response() {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    end(body = '') { this.body = body; },
  };
}

test('Vercel AI route is available without a session cookie', async () => {
  const originalUrl = process.env.OLLAMA_URL;
  const originalFetch = globalThis.fetch;
  process.env.OLLAMA_URL = 'https://ollama.example';
  globalThis.fetch = async (url, options) => {
    assert.equal(url.toString(), 'https://ollama.example/api/chat');
    assert.deepEqual(JSON.parse(options.body), {
      model: 'llama3.2',
      messages: [{ role: 'user', content: 'hello' }],
      stream: false,
    });
    return Response.json({ message: { content: 'hello back' } });
  };
  try {
    const res = response();
    await ai({
      method: 'POST',
      headers: {},
      body: { messages: [{ role: 'user', content: 'hello' }] },
    }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { answer: 'hello back', model: 'llama3.2' });
  } finally {
    if (originalUrl === undefined) delete process.env.OLLAMA_URL;
    else process.env.OLLAMA_URL = originalUrl;
    globalThis.fetch = originalFetch;
  }
});

test('Vercel AI reports missing optional configuration without requiring sign-in', async () => {
  const originalUrl = process.env.OLLAMA_URL;
  delete process.env.OLLAMA_URL;
  try {
    const res = response();
    await ai({
      method: 'POST',
      headers: {},
      body: { messages: [{ role: 'user', content: 'hello' }] },
    }, res);
    assert.equal(res.statusCode, 503);
    assert.match(res.body, /OLLAMA_URL/);
  } finally {
    if (originalUrl === undefined) delete process.env.OLLAMA_URL;
    else process.env.OLLAMA_URL = originalUrl;
  }
});
